-- ============================================================
--  어닝플레이스 HQ 업데이트 v21 (2026-10-29)  ※ v20 포함 — 이것 하나만 실행하면 돼요
--  손님방 = 오픈채팅 대신 (손님 링크 하나로)
--   · 손님 링크에 사진 + 현장팀 글 + 손님 글이 한 흐름으로
--   · 확정된 현장 직원은 어닝톡 '손님방'에서 글·사진 (손님에겐 '리츠종합클린 현장팀'으로만 보임)
--   · 대표님 + HQS 관리자는 늘 들어가서 봄
--   · [작업 끝]은 그날 수금 담당이 (수금 담당이 없으면 확정자 누구나) → 방에 완료 안내 자동
--   · 작업 끝 + 7일(설정값) 뒤 손님 링크·손님방 닫힘, 기록은 HQ에 남음
-- ============================================================
-- 메모에 남아 있던 '고객 이름 번호'를 고객 칸으로 옮기고 메모에서는 지움 (v19 보완)
update public.jobs set
  cust_phone = coalesce(cust_phone, (regexp_match(admin_memo, '(01[016789][-\s.]?\d{3,4}[-\s.]?\d{4})'))[1]),
  cust_name  = coalesce(cust_name, nullif(trim((regexp_match(admin_memo, '^고객\s+([^\s·0-9]+)'))[1]), ''))
where admin_memo ~ '^고객\s';
update public.jobs set admin_memo = nullif(trim(regexp_replace(admin_memo, '^고객\s+\S+\s+0[0-9\s.-]{8,}[0-9]\s*(·\s*)?', '')), '')
where admin_memo ~ '^고객\s' and (cust_name is not null or cust_phone is not null);

create or replace function public._live_open(j public.jobs) returns boolean language sql stable as $$
  select j.live_code is not null and not coalesce(j.live_closed, false) and j.status <> 'cancelled'
     and (coalesce(j.work_done_at, j.done_at) is null
          or coalesce(j.work_done_at, j.done_at) + make_interval(days => coalesce(j.live_close_days, 7)) > now())
$$;

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
    when 'cust' then (select '🙋 손님방 · ' || to_char(j.job_date, 'MM/DD') || ' ' || coalesce(j.title, '현장') from public.jobs j where j.id = r.job_id)
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
declare j public.jobs;
begin
  if length(coalesce(p_code,'')) < 6 then raise exception 'not_found'; end if;
  select * into j from public.jobs where live_code = upper(p_code) and status <> 'cancelled';
  if not found then raise exception 'not_found'; end if;
  if not public._live_open(j) then raise exception 'closed'; end if;
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
               'body', case when m.deleted_at is null then m.body end, 'photo', case when m.deleted_at is null then m.photo end,
               'deleted', m.deleted_at is not null, 'at', m.created_at) order by m.id)
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


create or replace function public._chat_members(r public.chat_rooms) returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select s.id from public.staff s
   where s.status <> 'left' and not s.hidden
     and case r.kind
           when 'all'    then public._chat_in_all(s.team)
           when 'team'   then public._chat_grp(s.team) = r.grp
           when 'dm'     then s.id = r.staff_id
           when 'site'   then exists (select 1 from public.assignments a where a.job_id = r.job_id and a.staff_id = s.id and a.status = 'approved')
           when 'cust'   then exists (select 1 from public.assignments a where a.job_id = r.job_id and a.staff_id = s.id and a.status = 'approved')
           when 'custom' then exists (select 1 from public.chat_members m where m.room_id = r.id and m.staff_id = s.id)
           else false end
$$;

create or replace function public._chat_can(s public.staff, r public.chat_rooms) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select r.closed_at is null
     and s.id in (select public._chat_members(r))
     and (r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j)))
     and (r.kind <> 'cust' or exists (select 1 from public.jobs j where j.id = r.job_id and public._live_open(j)))
$$;

create or replace function public._chat_ensure(s public.staff) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public._chat_in_all(s.team) then
    insert into public.chat_rooms (kind) values ('all') on conflict do nothing;
  end if;
  if public._chat_grp(s.team) is not null then
    insert into public.chat_rooms (kind, grp) values ('team', public._chat_grp(s.team)) on conflict do nothing;
  end if;
  insert into public.chat_rooms (kind, staff_id) values ('dm', s.id) on conflict do nothing;
  insert into public.chat_rooms (kind, job_id)
    select 'site', j.id from public.jobs j
     where exists (select 1 from public.assignments a where a.job_id = j.id and a.staff_id = s.id and a.status = 'approved')
       and public._chat_site_live(j)
    on conflict do nothing;
  -- 손님방: 확정된 현장 + 손님 링크가 열려 있는 동안 (작업일 하루 전부터)
  insert into public.chat_rooms (kind, job_id)
    select 'cust', j.id from public.jobs j
     where exists (select 1 from public.assignments a where a.job_id = j.id and a.staff_id = s.id and a.status = 'approved')
       and j.live_code is not null and j.job_date <= public._today() + 1 and public._live_open(j)
    on conflict do nothing;
end $$;

create or replace function public._chat_mgr(r public.chat_rooms) returns boolean language sql stable as $$
  select coalesce(r.mgr, r.kind in ('all','site','cust') or (r.kind = 'team' and r.grp in ('clean','prt')))
$$;

create or replace function public.staff_board(p_token text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.staff := public._me(p_token);
  out jsonb;
begin
  perform public._chat_ensure(s);   -- 손님방 미리 만들어 두기 (v21)
  update public.staff set last_seen_at = now() where id = s.id;
  update public.assignments a set seen_at = now()
    from public.jobs j
   where a.job_id = j.id and a.staff_id = s.id and a.status = 'approved'
     and j.job_date between p_from and p_to;

  select jsonb_build_object(
    'v', 2,
    'me', jsonb_build_object(
        'id', s.id, 'name', s.name, 'team', s.team,
        'team_name', (select name from public.teams where code = s.team),
        'role', s.role, 'can_collect', s.can_collect, 'pay_type', s.pay_type),
    'today', public._today(),
    'boss', public.boss_status(),
    'jobs', coalesce((
      select jsonb_agg(x order by x->>'date', x->>'time') from (
        select jsonb_build_object(
          'id', j.id,
          'date', j.job_date,
          'time', to_char(j.start_time, 'HH24:MI'),
          'title', j.title,
          'kind', j.kind,
          'headcount', j.headcount,
          'public_note', j.public_note,
          'status', j.status,
          'team', j.teams[1],
          'approved', (select count(*) from public.assignments a where a.job_id = j.id and a.status = 'approved'),
          'crew', coalesce((select jsonb_agg(st.name order by a.decided_at)
                     from public.assignments a join public.staff st on st.id = a.staff_id
                    where a.job_id = j.id and a.status = 'approved'), '[]'::jsonb),
          'my_status', my.status,
          'address',      case when my.status = 'approved' then j.address end,
          'private_note', case when my.status = 'approved' then j.private_note end,
          'need_ack',     (my.status = 'approved' and (my.ack_at is null or my.ack_at < j.changed_at)
                           and my.decided_at is not null and j.changed_at > my.decided_at),
          'collector',    (j.collector_id = s.id),
          'balance',      case when j.collector_id = s.id then j.balance_amount end,
          'collected_at', case when j.collector_id = s.id then j.collected_at end,
          -- 고객 이름·전화: 수금 담당만
          'cust_name',    case when j.collector_id = s.id then j.cust_name end,
          'cust_phone',   case when j.collector_id = s.id then j.cust_phone end,
          'my_pay',       case when my.status = 'approved' and j.status = 'done'
                               then coalesce(my.pay_amount,0) + coalesce(my.extra_amount,0) end,
          -- 현장 사진 (확정자만)
          'live',         case when my.status = 'approved' then j.live_code end,
          'photos',       case when my.status = 'approved' then (select count(*) from public.job_photos p where p.job_id = j.id) end,
          'work_done',    case when my.status = 'approved' then j.work_done_at end,
          -- 손님방 (v21): 확정자만 · 작업 끝은 수금 담당 (없으면 확정자 누구나)
          'cust_room',    case when my.status = 'approved' then (select id from public.chat_rooms where kind = 'cust' and job_id = j.id) end,
          'can_done',     (my.status = 'approved' and (j.collector_id is null or j.collector_id = s.id))
        ) as x
        from public.jobs j
        left join public.assignments my on my.job_id = j.id and my.staff_id = s.id
        where j.job_date between p_from and p_to and j.status <> 'quote'
          and (
            (public._can_see(j, s) and j.status <> 'cancelled')
            or my.status in ('applied','approved')
          )
      ) q), '[]'::jsonb),
    'avail', coalesce((select jsonb_object_agg(a.day, a.kind) from public.availability a
                        where a.staff_id = s.id and a.day between p_from and p_to), '{}'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
          'id', e.id, 'date', e.ev_date, 'time', to_char(e.ev_time,'HH24:MI'), 'kind', e.kind,
          'maemul', e.maemul_id, 'title', e.title, 'memo', e.memo, 'show_boss', e.show_boss, 'gcal', e.to_gcal)
          order by e.ev_date, e.ev_time)
        from public.events e where e.staff_id = s.id and e.ev_date between p_from and p_to), '[]'::jsonb),
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', n.id, 'title', n.title, 'body', n.body, 'important', n.important,
          'team', n.team, 'at', n.created_at,
          'read', r.read_at is not null, 'confirmed', r.confirmed_at is not null)
        order by n.created_at desc)
        from public.notices n
        left join public.notice_reads r on r.notice_id = n.id and r.staff_id = s.id
       where (n.team is null or n.team = s.team
              or (n.team = 'OPS' and s.team in ('SPT','PRT')))          -- 청소 공지 = 직영·지원·도급
         and n.created_at > now() - interval '60 days'), '[]'::jsonb)
  ) into out;
  return out;
end $$;
grant execute on function public.staff_board(text, date, date) to anon, authenticated;

-- [작업 끝]: 수금 담당만 (수금 담당이 없으면 확정자 누구나)
create or replace function public.staff_work_done(p_token text, p_job bigint)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); j public.jobs;
begin
  select * into j from public.jobs where id = p_job;
  if not exists (select 1 from public.assignments where job_id = p_job and staff_id = s.id and status = 'approved') then
    raise exception 'not_allowed';
  end if;
  if j.collector_id is not null and j.collector_id <> s.id then raise exception 'collector_only'; end if;
  update public.jobs set work_done_at = coalesce(work_done_at, now()) where id = p_job;
  return 'ok';
end $$;

-- 작업 끝이 찍히는 순간 손님방에 완료 안내 (HQ에서 눌러도 똑같이)
create or replace function private.on_work_done() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
declare rid bigint; days int := coalesce(new.live_close_days, 7);
begin
  if new.work_done_at is null or old.work_done_at is not null or new.live_code is null then return null; end if;
  insert into public.chat_rooms (kind, job_id) values ('cust', new.id) on conflict do nothing;
  select id into rid from public.chat_rooms where kind = 'cust' and job_id = new.id;
  insert into public.chat_messages (room_id, staff_id, admin_uid, body)
    values (rid, null, null, '✅ 작업이 모두 끝났어요. 고생한 현장팀을 대신해 감사 인사드려요!' || E'\n' ||
                            '위쪽 완료 리포트에서 전·후 사진과 잔금 안내를 확인해 주세요.' || E'\n' ||
                            '불편한 곳이 있으면 이 방에 편하게 남겨주세요 (' || days || '일 뒤 이 방은 닫혀요).');
  return null;
exception when others then return null;
end $$;
drop trigger if exists job_work_done_msg on public.jobs;
create trigger job_work_done_msg after update of work_done_at on public.jobs for each row execute function private.on_work_done();

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 21 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v21)' as result;
