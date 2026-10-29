-- ============================================================
--  어닝플레이스 HQ 업데이트 v24 (2026-10-29)
--  [작업 끝]은 그날 수금 담당(팀장)만
--   · 고객님 방 맨 위 초록 버튼 — 수금 담당 화면에만 보임 (다른 직원은 버튼 없음)
--   · 확인창에 작업 전·후 사진 장수 표시
--   · 작업 끝 안내 글을 수금 담당 이름으로 올려 대표님·HQS 관리자에게 알림
--   · 수금 담당이 없는 현장은 HQ에서 [지금 작업 끝으로]
--   · 현장 대화방은 하나로: 고객님 방이 있는 현장은 직원 현장방을 따로 안 만듦
--   · 방 목록에 작업 상태 (작업 중 초록 · 작업 끝 빨강)
-- ============================================================
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
          'can_done',     (my.status = 'approved' and j.collector_id = s.id),   -- v24: 그날 수금 담당만
          'ph_before',    case when my.status = 'approved' then (select count(*) from public.job_photos p where p.job_id = j.id and p.stage = 'before') end,
          'ph_after',     case when my.status = 'approved' then (select count(*) from public.job_photos p where p.job_id = j.id and p.stage = 'after') end
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

create or replace function public.staff_work_done(p_token text, p_job bigint)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); j public.jobs;
begin
  select * into j from public.jobs where id = p_job;
  if not exists (select 1 from public.assignments where job_id = p_job and staff_id = s.id and status = 'approved') then
    raise exception 'not_allowed';
  end if;
  if j.collector_id is distinct from s.id then raise exception 'collector_only'; end if;   -- v24: 수금 담당만
  update public.jobs set work_done_at = coalesce(work_done_at, now()) where id = p_job;
  return 'ok';
end $$;

create or replace function private.on_work_done() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
declare rid bigint; days int := coalesce(new.live_close_days, 7);
begin
  if new.work_done_at is null or old.work_done_at is not null or new.live_code is null then return null; end if;
  insert into public.chat_rooms (kind, job_id) values ('cust', new.id) on conflict do nothing;
  select id into rid from public.chat_rooms where kind = 'cust' and job_id = new.id;
  -- 수금 담당 이름으로 올림 → 대표님·관리자에게 '작업 끝' 알림이 감 (고객님 화면엔 '리츠종합클린 현장팀')
  insert into public.chat_messages (room_id, staff_id, admin_uid, body)
    values (rid, new.collector_id, null, '✅ 작업이 모두 끝났어요. 고생한 현장팀을 대신해 감사 인사드려요!' || E'\n' ||
                            '위쪽 완료 리포트에서 전·후 사진과 잔금 안내를 확인해 주세요.' || E'\n' ||
                            '불편한 곳이 있으면 이 방에 편하게 남겨주세요 (' || days || '일 뒤 이 방은 닫혀요).');
  return null;
exception when others then return null;
end $$;

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
     where j.live_code is null and exists (select 1 from public.assignments a where a.job_id = j.id and a.staff_id = s.id and a.status = 'approved')
       and public._chat_site_live(j)
    on conflict do nothing;
  -- 손님방: 확정된 현장 + 손님 링크가 열려 있는 동안 (작업일 하루 전부터)
  insert into public.chat_rooms (kind, job_id)
    select 'cust', j.id from public.jobs j
     where exists (select 1 from public.assignments a where a.job_id = j.id and a.staff_id = s.id and a.status = 'approved')
       and j.live_code is not null and j.job_date <= public._today() + 1 and public._live_open(j)
    on conflict do nothing;
end $$;

create or replace function public._chat_can(s public.staff, r public.chat_rooms) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select r.closed_at is null
     and s.id in (select public._chat_members(r))
     and (r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j)
                                         and (j.live_code is null or exists (select 1 from public.chat_messages m where m.room_id = r.id))))   -- v24: 고객님 방이 있으면 현장방은 숨김 (대화가 있던 방은 유지)
     and (r.kind <> 'cust' or exists (select 1 from public.jobs j where j.id = r.job_id and public._live_open(j)))
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
        'id', r.id, 'kind', r.kind, 'grp', r.grp, 'title', public._chat_title_hq(r), 'custom_title', r.title,
        'staff_id', r.staff_id, 'job_id', r.job_id, 'keep', r.keep, 'mgr', public._chat_mgr(r),
        'closed', r.closed_at is not null or (r.kind = 'cust' and not exists (select 1 from public.jobs j where j.id = r.job_id and public._live_open(j))),
        'job_date', (select job_date from public.jobs j where j.id = r.job_id),
        'job_done', (select coalesce(j.work_done_at, j.done_at) from public.jobs j where j.id = r.job_id), 'closed_at', r.closed_at, 'created_at', r.created_at,
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

create or replace function public.chat_home(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  if not public._chat_on(s) then return jsonb_build_object('on', false); end if;
  perform public._chat_ensure(s);
  return jsonb_build_object('on', true, 'me', jsonb_build_object('id', s.id, 'name', s.name),
    'rooms', coalesce((select jsonb_agg(x order by (x->>'kind_o')::int, x->>'last_at' desc nulls last) from (
      select jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'title', case when r.kind = 'dm' then '대표님' else public._chat_title(r) end,
        'kind_o', case r.kind when 'dm' then 1 when 'all' then 2 when 'team' then 3 when 'site' then 4 when 'cust' then 4 else 5 end,
        'job_date', (select job_date from public.jobs j where j.id = r.job_id),
        'job_done', (select coalesce(j.work_done_at, j.done_at) from public.jobs j where j.id = r.job_id),
        'last', (select jsonb_build_object('body', case when m.deleted_at is not null then '삭제된 메시지' when m.body is null or m.body = '' then '사진' else m.body end,
                         'name', public._chat_msg_json(m, s.id, false)->>'name', 'at', m.created_at)
                   from public.chat_messages m where m.room_id = r.id order by m.id desc limit 1),
        'last_at', (select max(created_at) from public.chat_messages m where m.room_id = r.id),
        'unread', (select count(*) from public.chat_messages m where m.room_id = r.id
                     and m.id > coalesce((select last_id from public.chat_reads where room_id = r.id and who = s.id::text), 0)
                     and (m.staff_id is distinct from s.id)),
        'n', (select count(*) from public._chat_members(r)) + 1,
        'mgr', public._chat_mgr(r)
      ) x
      from public.chat_rooms r where public._chat_can(s, r)) q), '[]'::jsonb));
end $$;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 24 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v24)' as result;
