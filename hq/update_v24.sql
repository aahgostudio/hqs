-- ============================================================
--  어닝플레이스 HQ 업데이트 v24 (2026-10-29)
--  [작업 끝]은 그날 수금 담당(팀장)만
--   · 고객님 방 맨 위 초록 버튼 — 수금 담당 화면에만 보임 (다른 직원은 버튼 없음)
--   · 확인창에 작업 전·후 사진 장수 표시
--   · 작업 끝 안내 글을 수금 담당 이름으로 올려 대표님·HQS 관리자에게 알림
--   · 수금 담당이 없는 현장은 HQ에서 [지금 작업 끝으로]
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

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 24 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v24)' as result;
