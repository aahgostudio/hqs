-- ============================================================
--  어닝플레이스 HQ 업데이트 v20 (2026-10-29)
--  손님 링크 안 대화방 (오픈채팅 대신)
--   · 손님은 링크(/live)에서 바로 글을 남김 — 카톡·로그인 없음, 우리 번호·직원 이름 안 보임
--   · HQ 대화에 현장별 '💬 고객' 방이 생김 (손님이 첫 글을 남길 때) — 기본은 대표님만
--   · 손님 글 → 대표님께 어닝톡 푸시/알림톡 (손님에게 문자 알림은 안 보냄)
--   · 링크가 닫히면 손님 쪽 대화도 닫힘, 기록은 HQ에 남음
-- ============================================================
alter table public.chat_messages add column if not exists cust boolean not null default false;
alter table public.chat_rooms drop constraint if exists chat_rooms_kind_check;
alter table public.chat_rooms add constraint chat_rooms_kind_check check (kind in ('all','team','site','dm','custom','cust'));
create unique index if not exists chat_rooms_cust on public.chat_rooms (job_id) where kind = 'cust';

create or replace function public._chat_title(r public.chat_rooms) returns text
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(r.title, case r.kind
    when 'all'  then '전체'
    when 'team' then public._chat_grp_title(r.grp)
    when 'dm'   then (select name from public.staff where id = r.staff_id)
    when 'cust' then (select '💬 고객 · ' || to_char(j.job_date, 'MM/DD') || ' ' || coalesce(j.title, '현장') from public.jobs j where j.id = r.job_id)
    when 'site' then (select to_char(j.job_date, 'MM/DD') || ' ' || coalesce(j.title, '현장') from public.jobs j where j.id = r.job_id)
    else '대화방' end)
$$;

create or replace function public._chat_msg_json(m public.chat_messages, p_me uuid, p_admin boolean) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', m.id,
    'who', case when m.cust then 'cust' else coalesce(m.staff_id::text, case when m.admin_uid is null or exists (select 1 from public.admins a where a.user_id = m.admin_uid and a.role = 'owner') then 'boss' else 'mgr:' || m.admin_uid::text end) end,
    'name', case when m.cust then '고객님' else coalesce((select name from public.staff where id = m.staff_id),
                     case when m.admin_uid is null or exists (select 1 from public.admins a where a.user_id = m.admin_uid and a.role = 'owner') then '대표'
                          else '관리자 ' || coalesce((select name from public.admins a where a.user_id = m.admin_uid), '') end) end,
    'avatar', (select avatar_path from public.staff where id = m.staff_id),
    'mine', case when m.cust then false when p_me is null then (m.staff_id is null and (m.admin_uid = auth.uid() or (m.admin_uid is null and public.is_owner()))) else m.staff_id = p_me end,
    'body', case when m.deleted_at is null or p_admin then m.body end,
    'photo', case when m.deleted_at is null or p_admin then m.photo end,
    'at', m.created_at,
    'edited', m.edited_at is not null,
    'deleted', m.deleted_at is not null,
    'history', case when p_admin then m.history end)
$$;

create or replace function public.chat_admin_home() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare st public.staff; own boolean := public.is_owner(); me text := public._chat_who();
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  for st in select * from public.staff where status <> 'left' and not hidden loop
    perform public._chat_ensure(st);
  end loop;
  return jsonb_build_object(
    'on', coalesce((select value #>> '{}' from public.settings where key = 'chat_on'), 'false') = 'true',
    'owner', own,
    'rooms', coalesce((select jsonb_agg(x order by (x->>'closed')::boolean, (x->>'kind_o')::int, x->>'last_at' desc nulls last) from (
      select jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'grp', r.grp, 'title', public._chat_title(r), 'custom_title', r.title,
        'staff_id', r.staff_id, 'job_id', r.job_id, 'keep', r.keep, 'mgr', public._chat_mgr(r),
        'closed', r.closed_at is not null, 'closed_at', r.closed_at, 'created_at', r.created_at,
        'live', r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j)),
        'left_at', case when r.kind = 'dm' then (select left_at from public.staff where id = r.staff_id) end,
        'kind_o', case r.kind when 'all' then 1 when 'team' then 2 when 'custom' then 3 when 'cust' then 0 when 'site' then 4 else 5 end,
        'last', (select jsonb_build_object('body', case when m.deleted_at is not null then '삭제된 메시지' when coalesce(m.body,'') = '' then '사진' else m.body end,
                         'name', public._chat_msg_json(m, null, false)->>'name', 'at', m.created_at)
                   from public.chat_messages m where m.room_id = r.id order by m.id desc limit 1),
        'last_at', (select max(created_at) from public.chat_messages m where m.room_id = r.id),
        'count', (select count(*) from public.chat_messages m where m.room_id = r.id),
        'unread', (select count(*) from public.chat_messages m where m.room_id = r.id
                     and (m.cust or not (m.staff_id is null and (m.admin_uid = auth.uid() or (m.admin_uid is null and own))))
                     and m.id > coalesce((select last_id from public.chat_reads where room_id = r.id and who = me), 0)),
        'members', (select coalesce(jsonb_agg(x2), '[]'::jsonb) from public._chat_members(r) x2)
      ) x
      from public.chat_rooms r
     where own or (public._chat_mgr(r) and r.closed_at is null
                   and (r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j))))) q), '[]'::jsonb));
end $$;
grant execute on function public.chat_admin_home() to authenticated;

create or replace function private.on_chat_msg() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
declare r public.chat_rooms; c jsonb := private.cfg(); cool interval; sender text; title text; prev text; pv text;
        msgs jsonb := '[]'::jsonb; pushes jsonb := '[]'::jsonb; s public.staff; body text; mn boolean; mall boolean; subs jsonb; base text := 'https://team.earningplace.kr';
begin
  if new.deleted_at is not null then return null; end if;
  select * into r from public.chat_rooms where id = new.room_id;
  if r.id is null or r.closed_at is not null then return null; end if;
  cool := make_interval(mins => coalesce((c->>'cool_min')::int, 3));
  sender := case when new.cust then '고객님' when new.staff_id is null then '대표' else coalesce((select name from public.staff where id = new.staff_id), '직원') end;
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
    if private.here(r.id, s.id::text) then continue; end if;   -- 지금 이 방 보고 있음 → 알림 안 보냄 (v18)
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
  if (new.staff_id is not null or new.cust) and coalesce((c->>'boss_chat')::boolean, true) and not private.here(r.id, 'boss') then   -- 대표님이 이 방 보고 있으면 알림 안 보냄 (v18)
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

-- ------------------------------------------------------------
--  손님 쪽 (링크 코드로만)
-- ------------------------------------------------------------
create or replace function public._live_job(p_code text) returns public.jobs
language plpgsql stable security definer set search_path = public, extensions as $$
declare j public.jobs; close_at timestamptz;
begin
  if length(coalesce(p_code,'')) < 6 then raise exception 'not_found'; end if;
  select * into j from public.jobs where live_code = upper(p_code) and status <> 'cancelled';
  if not found then raise exception 'not_found'; end if;
  close_at := coalesce(j.work_done_at, j.done_at) + make_interval(days => j.live_close_days);
  if j.live_closed or (close_at is not null and close_at < now()) then raise exception 'closed'; end if;
  return j;
end $$;
revoke all on function public._live_job(text) from anon, authenticated;

create or replace function public.live_chat(p_code text, p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare j public.jobs := public._live_job(p_code); rid bigint; mx bigint;
begin
  select id into rid from public.chat_rooms where kind = 'cust' and job_id = j.id;
  if rid is null then return jsonb_build_object('msgs', '[]'::jsonb, 'unread', 0); end if;
  select max(id) into mx from public.chat_messages where room_id = rid;
  return jsonb_build_object(
    'msgs', coalesce((select jsonb_agg(jsonb_build_object('id', m.id, 'me', m.cust,
               'body', case when m.deleted_at is null then m.body end, 'deleted', m.deleted_at is not null, 'at', m.created_at) order by m.id)
             from public.chat_messages m where m.room_id = rid and m.id > coalesce(p_after, 0)), '[]'::jsonb),
    'unread', (select count(*) from public.chat_messages m where m.room_id = rid and not m.cust and m.deleted_at is null
                 and m.id > coalesce((select last_id from public.chat_reads where room_id = rid and who = 'cust'), 0)));
end $$;

create or replace function public.live_chat_read(p_code text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare j public.jobs := public._live_job(p_code); rid bigint; mx bigint;
begin
  select id into rid from public.chat_rooms where kind = 'cust' and job_id = j.id;
  select max(id) into mx from public.chat_messages where room_id = rid;
  if mx is not null then
    insert into public.chat_reads (room_id, who, last_id) values (rid, 'cust', mx)
      on conflict (room_id, who) do update set last_id = greatest(public.chat_reads.last_id, excluded.last_id), at = now();
  end if;
  return 'ok';
end $$;

create or replace function public.live_chat_send(p_code text, p_body text) returns bigint
language plpgsql security definer set search_path = public, extensions as $$
declare j public.jobs := public._live_job(p_code); rid bigint; nid bigint;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'empty'; end if;
  insert into public.chat_rooms (kind, job_id) values ('cust', j.id) on conflict do nothing;
  select id into rid from public.chat_rooms where kind = 'cust' and job_id = j.id;
  if (select closed_at from public.chat_rooms where id = rid) is not null then raise exception 'closed'; end if;
  -- 도배 막기: 10분에 20개까지
  if (select count(*) from public.chat_messages where room_id = rid and cust and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'too_many';
  end if;
  insert into public.chat_messages (room_id, staff_id, admin_uid, body, cust)
    values (rid, null, null, left(trim(p_body), 1000), true) returning id into nid;
  insert into public.chat_reads (room_id, who, last_id) values (rid, 'cust', nid)
    on conflict (room_id, who) do update set last_id = excluded.last_id, at = now();
  return nid;
end $$;

grant execute on function public.live_chat(text, bigint), public.live_chat_read(text), public.live_chat_send(text, text) to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 20 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v20)' as result;
