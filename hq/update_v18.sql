-- ============================================================
--  어닝플레이스 HQ 업데이트 v18 (2026-10-29)
--  대화방을 보고 있는 중엔 그 방 새 글 알림(어닝톡 푸시·알림톡)을 안 보냄
--   · 화면이 방을 보고 있는 동안 몇 초마다 "여기 보고 있어요"를 서버에 남김
--   · 마지막 신호가 12초 안이면 = 보고 있음 → 그 사람한테는 알림 생략
--   · 화면을 끄거나 앱을 내리거나 방을 나가면 바로 다시 알림 옴
-- ============================================================
create table if not exists private.chat_here (
  room_id bigint not null,
  who     text   not null,                 -- staff uuid 또는 'boss'
  at      timestamptz not null default now(),
  primary key (room_id, who)
);
revoke all on private.chat_here from public, anon, authenticated;

create or replace function private.here(p_room bigint, p_who text) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from private.chat_here where room_id = p_room and who = p_who and at > now() - interval '12 seconds')
$$;

create or replace function private._here_set(p_who text, p_room bigint) returns void
language plpgsql security definer set search_path = public, private as $$
begin
  delete from private.chat_here where who = p_who and room_id is distinct from p_room;
  if p_room is not null then
    insert into private.chat_here (room_id, who, at) values (p_room, p_who, now())
      on conflict (room_id, who) do update set at = now();
  end if;
end $$;

-- 직원 화면 (카톡 링크 토큰): 지금 보고 있는 방 (null = 안 보고 있음)
create or replace function public.chat_here(p_token text, p_room bigint) returns text
language plpgsql security definer set search_path = public, extensions, private as $$
declare s public.staff := public._me(p_token);
begin
  if s.id is null then return 'no'; end if;
  perform private._here_set(s.id::text, p_room); return 'ok';
end $$;
grant execute on function public.chat_here(text, bigint) to anon, authenticated;

-- 대표 화면 (HQ)
create or replace function public.chat_here_boss(p_room bigint) returns text
language plpgsql security definer set search_path = public, extensions, private as $$
begin
  if not public.is_admin() then return 'no'; end if;
  perform private._here_set('boss', p_room); return 'ok';
end $$;
revoke all on function public.chat_here_boss(bigint) from anon;
grant execute on function public.chat_here_boss(bigint) to authenticated;

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
  if new.staff_id is not null and coalesce((c->>'boss_chat')::boolean, true) and not private.here(r.id, 'boss') then   -- 대표님이 이 방 보고 있으면 알림 안 보냄 (v18)
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

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 18 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v18)' as result;
