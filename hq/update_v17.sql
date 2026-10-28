-- ============================================================
--  어닝플레이스 HQ 업데이트 v17 (2026-10-29)
--  어닝톡 푸시 알림: 아이콘 깔고 알림 허용한 사람 = 푸시(무료), 아니면 = 카톡 알림톡
--   · 푸시 보내고 30분 안에 안 읽으면 알림톡 한 번 더 (5분마다 확인)
--   · 아이콘을 지우거나 알림을 끄면 서버가 알아서 알림톡으로 돌아감
--  ※ 키 3개(__VAPID_PUB__ 등)는 실행할 때만 넣어요 (저장소에는 안 올림)
-- ============================================================
create extension if not exists pg_cron;

create table if not exists public.push_subs (
  endpoint   text primary key,
  who        text not null,                 -- 직원 uuid 또는 'boss'
  sub        jsonb not null,                -- 브라우저 푸시 구독 정보
  ua         text,
  created_at timestamptz not null default now()
);
create index if not exists push_subs_who on public.push_subs (who);
alter table public.push_subs enable row level security;
revoke all on public.push_subs from anon, authenticated;

create table if not exists private.push_cfg (
  id int primary key default 1, pub text not null, priv text not null, subject text not null, secret text not null, fn_url text not null);
revoke all on private.push_cfg from public, anon, authenticated;
insert into private.push_cfg (id, pub, priv, subject, secret, fn_url)
values (1, '__VAPID_PUB__', '__VAPID_PRIV__', 'mailto:contact@earningplace.kr', '__SECRET__',
        'https://ldvknvmsnpbporxhnsli.supabase.co/functions/v1/push')
on conflict (id) do update set pub = excluded.pub, priv = excluded.priv, secret = excluded.secret, fn_url = excluded.fn_url;

-- 30분 뒤 확인할 목록 (사람·방마다 '처음 안 읽은 메시지' 하나)
create table if not exists private.push_wait (
  room_id bigint not null, who text not null, msg_id bigint not null, at timestamptz not null default now(),
  primary key (room_id, who));
revoke all on private.push_wait from public, anon, authenticated;

-- ---------- 구독 등록·해제 ----------
create or replace function public.push_subscribe(p_token text, p_sub jsonb, p_ua text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  if s.id is null or coalesce(p_sub->>'endpoint', '') = '' then raise exception 'bad'; end if;
  insert into public.push_subs (endpoint, who, sub, ua) values (p_sub->>'endpoint', s.id::text, p_sub, left(p_ua, 200))
    on conflict (endpoint) do update set who = excluded.who, sub = excluded.sub, ua = excluded.ua, created_at = now();
  return 'ok';
end $$;
grant execute on function public.push_subscribe(text, jsonb, text) to anon, authenticated;

create or replace function public.push_subscribe_boss(p_sub jsonb, p_ua text default null) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() or coalesce(p_sub->>'endpoint', '') = '' then raise exception 'owner_only'; end if;
  insert into public.push_subs (endpoint, who, sub, ua) values (p_sub->>'endpoint', 'boss', p_sub, left(p_ua, 200))
    on conflict (endpoint) do update set who = 'boss', sub = excluded.sub, ua = excluded.ua, created_at = now();
  return 'ok';
end $$;
revoke all on function public.push_subscribe_boss(jsonb, text) from anon;
grant execute on function public.push_subscribe_boss(jsonb, text) to authenticated;

create or replace function public.push_unsubscribe(p_endpoint text) returns text
language sql security definer set search_path = public as $$
  delete from public.push_subs where endpoint = p_endpoint; select 'ok';
$$;
grant execute on function public.push_unsubscribe(text) to anon, authenticated;

-- 대표 HQ: 누가 푸시로 받는지 (📲 표시)
create or replace function public.push_who() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then coalesce((select jsonb_agg(distinct who) from public.push_subs), '[]'::jsonb) else '[]'::jsonb end
$$;
grant execute on function public.push_who() to authenticated;

-- 화면용 공개키
create or replace function public.push_pub() returns text
language sql stable security definer set search_path = public, private as $$ select pub from private.push_cfg where id = 1 $$;
grant execute on function public.push_pub() to anon, authenticated;

-- 푸시 보내는 서버 함수(Edge Function)만 쓰는 것
create or replace function public.push_keys() returns jsonb
language sql stable security definer set search_path = public, private as $$
  select jsonb_build_object('pub', pub, 'priv', priv, 'subject', subject, 'secret', secret) from private.push_cfg where id = 1
$$;
revoke all on function public.push_keys() from public, anon, authenticated;
grant execute on function public.push_keys() to service_role;

create or replace function public.push_dead(p_endpoints text[]) returns int
language sql security definer set search_path = public as $$
  with d as (delete from public.push_subs where endpoint = any(p_endpoints) returning 1) select count(*)::int from d
$$;
revoke all on function public.push_dead(text[]) from public, anon, authenticated;
grant execute on function public.push_dead(text[]) to service_role;

-- 서버 함수로 푸시 묶음 보내기
create or replace function private.push_send(p_msgs jsonb) returns bigint
language plpgsql security definer set search_path = public, extensions, private as $$
declare k private.push_cfg; rid bigint;
begin
  if p_msgs is null or jsonb_array_length(p_msgs) = 0 then return null; end if;
  select * into k from private.push_cfg where id = 1; if k.id is null then return null; end if;
  select net.http_post(url := k.fn_url, body := jsonb_build_object('msgs', p_msgs),
           headers := jsonb_build_object('content-type', 'application/json', 'x-push-secret', k.secret)) into rid;
  return rid;
end $$;

-- ---------- 대화 새 글 → 푸시 또는 알림톡 ----------
create or replace function private.on_chat_msg() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
declare r public.chat_rooms; c jsonb := private.cfg(); cool interval; sender text; title text; prev text; pv text;
        msgs jsonb := '[]'::jsonb; pushes jsonb := '[]'::jsonb; s public.staff; body text; mn boolean; mall boolean; subs jsonb; base text := 'https://team.earningplace.kr';
begin
  if new.deleted_at is not null then return null; end if;
  select * into r from public.chat_rooms where id = new.room_id;
  if r.id is null or r.closed_at is not null then return null; end if;
  cool := make_interval(mins => coalesce((c->>'cool_min')::int, 3));
  sender := case when new.staff_id is null then '대표' else coalesce((select name from public.staff where id = new.staff_id), '직원') end;
  title := public._chat_title(r);
  body := coalesce(new.body, '');
  mall := new.staff_id is null and position('@all' in body) > 0;
  prev := private.cut(replace(replace(coalesce(nullif(trim(new.body), ''), case when new.photo ~* '\.(mov|mp4|m4v|webm|3gp)$' then '🎬 동영상' when new.photo is not null then '📷 사진' else '' end), E'\n', ' '), E'\r', ''), 40);

  for s in select st.* from public.staff st
            where st.id in (select public._chat_members(r))
              and st.id is distinct from new.staff_id
              and public._chat_on(st)
              and (r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j)))
  loop
    mn := mall or position('@' || s.name in body) > 0;
    pv := case when mn then private.cut('📣 ' || prev, 40) else prev end;
    select jsonb_agg(p.sub) into subs from public.push_subs p where p.who = s.id::text;
    if subs is not null then
      -- 📲 푸시 (메시지마다, 무료) + 30분 뒤 안 읽었으면 알림톡
      pushes := pushes || jsonb_build_array(jsonb_build_object('subs', subs,
                  'title', case when r.kind = 'dm' then '대표님' else title end,
                  'body', case when r.kind = 'dm' then pv else sender || ': ' || pv end,
                  'tag', 'room-' || r.id,
                  'url', base || '/talk/?app=chat&k=' || private.code(s, r.id)));
      insert into private.push_wait (room_id, who, msg_id) values (r.id, s.id::text, new.id) on conflict (room_id, who) do update set msg_id = excluded.msg_id, at = now()
        where coalesce((select cr.last_id from public.chat_reads cr where cr.room_id = push_wait.room_id and cr.who = push_wait.who), 0) >= push_wait.msg_id;   -- 이미 읽은 건 새 글 기준으로 다시 30분
      continue;
    end if;
    -- 💬 알림톡 (기존 규칙: 같은 방 3분에 한 번, 멘션은 바로)
    if private.digits(s.phone) is null then continue; end if;
    if not mn and exists (select 1 from private.notify_log l where l.room_id = r.id and l.who = s.id::text and l.at > now() - cool) then continue; end if;
    insert into private.notify_log (room_id, who, at) values (r.id, s.id::text, now())
      on conflict (room_id, who) do update set at = excluded.at;
    if r.kind = 'dm' and new.staff_id is null then
      msgs := msgs || jsonb_build_array(jsonb_build_object('to', s.phone, 'tpl', c->>'tpl_dm',
                'vars', jsonb_build_object('#{미리보기}', pv, '#{코드}', private.code(s, r.id))));
    else
      msgs := msgs || jsonb_build_array(jsonb_build_object('to', s.phone, 'tpl', c->>'tpl_team',
                'vars', jsonb_build_object('#{방이름}', title, '#{보낸사람}', sender, '#{미리보기}', pv, '#{코드}', private.code(s, r.id))));
    end if;
  end loop;

  -- 직원이 쓴 글 → 대표님께도
  if new.staff_id is not null and coalesce((c->>'boss_chat')::boolean, true) then
    select jsonb_agg(p.sub) into subs from public.push_subs p where p.who = 'boss';
    if subs is not null then
      pushes := pushes || jsonb_build_array(jsonb_build_object('subs', subs,
                  'title', case when r.kind = 'dm' then sender || '님' else title end,
                  'body', case when r.kind = 'dm' then prev else sender || ': ' || prev end,
                  'tag', 'room-' || r.id, 'url', base || '/hq/?app=chat#chat/' || r.id));
      insert into private.push_wait (room_id, who, msg_id) values (r.id, 'boss', new.id) on conflict (room_id, who) do update set msg_id = excluded.msg_id, at = now()
        where coalesce((select cr.last_id from public.chat_reads cr where cr.room_id = push_wait.room_id and cr.who = push_wait.who), 0) >= push_wait.msg_id;   -- 이미 읽은 건 새 글 기준으로 다시 30분
    elsif private.digits(c->>'boss_phone') is not null
       and (position('@대표' in body) > 0 or not exists (select 1 from private.notify_log l where l.room_id = r.id and l.who = 'boss' and l.at > now() - cool)) then
      insert into private.notify_log (room_id, who, at) values (r.id, 'boss', now())
        on conflict (room_id, who) do update set at = excluded.at;
      msgs := msgs || jsonb_build_array(jsonb_build_object('to', c->>'boss_phone', 'tpl', c->>'tpl_team',
                'vars', jsonb_build_object('#{방이름}', case when r.kind = 'dm' then sender || '님 1:1' else title end,
                                           '#{보낸사람}', sender, '#{미리보기}', prev, '#{코드}', 'hq.' || r.id)));
    end if;
  end if;

  perform private.send(msgs);
  perform private.push_send(pushes);
  return null;
exception when others then
  return null;   -- 알림이 실패해도 대화 저장은 그대로
end $$;

-- ---------- 5분마다: 푸시 받고 30분 넘게 안 읽은 사람 → 알림톡 한 번 ----------
create or replace function private.push_fallback() returns int
language plpgsql security definer set search_path = public, extensions, private as $$
declare w record; c jsonb := private.cfg(); r public.chat_rooms; s public.staff; msgs jsonb := '[]'::jsonb; n int := 0; m public.chat_messages; sender text; prev text;
begin
  for w in select * from private.push_wait where at < now() - interval '30 minutes' loop
    delete from private.push_wait where room_id = w.room_id and who = w.who;
    if coalesce((select last_id from public.chat_reads where room_id = w.room_id and who = w.who), 0) >= w.msg_id then continue; end if;   -- 읽었음
    select * into r from public.chat_rooms where id = w.room_id; if r.id is null or r.closed_at is not null then continue; end if;
    select * into m from public.chat_messages where id = w.msg_id; if m.id is null or m.deleted_at is not null then continue; end if;
    sender := case when m.staff_id is null then '대표' else coalesce((select name from public.staff where id = m.staff_id), '직원') end;
    prev := private.cut('⏰ ' || replace(coalesce(nullif(trim(m.body), ''), case when m.photo is not null then '📷 사진' else '' end), E'\n', ' '), 40);
    if w.who = 'boss' then
      if private.digits(c->>'boss_phone') is null then continue; end if;
      msgs := msgs || jsonb_build_array(jsonb_build_object('to', c->>'boss_phone', 'tpl', c->>'tpl_team',
                'vars', jsonb_build_object('#{방이름}', case when r.kind = 'dm' then sender || '님 1:1' else public._chat_title(r) end,
                                           '#{보낸사람}', sender, '#{미리보기}', prev, '#{코드}', 'hq.' || r.id)));
    else
      select * into s from public.staff where id::text = w.who; if s.id is null or private.digits(s.phone) is null then continue; end if;
      if r.kind = 'dm' and m.staff_id is null then
        msgs := msgs || jsonb_build_array(jsonb_build_object('to', s.phone, 'tpl', c->>'tpl_dm',
                  'vars', jsonb_build_object('#{미리보기}', prev, '#{코드}', private.code(s, r.id))));
      else
        msgs := msgs || jsonb_build_array(jsonb_build_object('to', s.phone, 'tpl', c->>'tpl_team',
                  'vars', jsonb_build_object('#{방이름}', public._chat_title(r), '#{보낸사람}', sender, '#{미리보기}', prev, '#{코드}', private.code(s, r.id))));
      end if;
    end if;
    n := n + 1;
  end loop;
  perform private.send(msgs);
  return n;
end $$;

do $$ begin perform cron.unschedule('push_fallback'); exception when others then null; end $$;
select cron.schedule('push_fallback', '*/5 * * * *', 'select private.push_fallback()');

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 17 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v17)' as result;
