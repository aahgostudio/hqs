-- ============================================================
--  어닝플레이스 HQ 업데이트 v30 (2026-11-01)
--  도급·수금 담당 화면 보완
--   · 고객님 방: 확정되면 바로 만들어 둠 (예전엔 작업 전날부터)
--   · 수금 담당이 현장에서 받은 추가금을 직접 적음 (사유·금액)
--     → HQ 금액·증빙의 추가금 줄에 '현장 추가 · 직원 입력'으로 들어감
--   · [작업 끝]: 수금 담당이 없거나 안 가면 확정된 팀장도 누를 수 있음
--   · 도급 사장님 확정된 현장 = 인원 완료 (자리 빔 표시 안 함)
--   · 대표님 혼자 가는 현장: HQ 고객님 방 맨 위에서 [작업 끝]
-- ============================================================
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
       and j.live_code is not null and public._live_open(j)
    on conflict do nothing;
end $$;


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
          'can_done',     public._can_work_done(j, s),   -- v30: 수금 담당 · 수금 담당이 없거나 현장에 안 가면 확정된 팀장
          'ph_before',    case when my.status = 'approved' then (select count(*) from public.job_photos p where p.job_id = j.id and p.stage = 'before') end,
          -- v30: 수금 담당이 현장에서 받은 추가금
          'extras',       case when j.collector_id = s.id then coalesce(j.extras,'[]'::jsonb) end,
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

-- [작업 끝] 누를 수 있는 사람 (v30)
--  · 그날 수금 담당
--  · 수금 담당이 없거나(대표·회사 계좌) 그 사람이 현장에 안 가면 → 확정된 팀장(수금 가능) 누구나
create or replace function public._can_work_done(j public.jobs, s public.staff) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.assignments a where a.job_id = j.id and a.staff_id = s.id and a.status = 'approved')
     and ( j.collector_id = s.id
           or (s.can_collect and (j.collector_id is null
               or not exists (select 1 from public.assignments a where a.job_id = j.id and a.staff_id = j.collector_id and a.status = 'approved'))) )
$$;

create or replace function public.staff_work_done(p_token text, p_job bigint)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); j public.jobs;
begin
  select * into j from public.jobs where id = p_job;
  if j.id is null or not public._can_work_done(j, s) then raise exception 'collector_only'; end if;
  update public.jobs set work_done_at = coalesce(work_done_at, now()) where id = p_job;
  return 'ok';
end $$;
grant execute on function public.staff_work_done(text, bigint) to anon, authenticated;

-- 작업 끝 안내 글: 수금 담당이 없으면 누른 관리자(대표님) 이름으로 올림
create or replace function private.on_work_done() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
declare rid bigint; days int := coalesce(new.live_close_days, 7);
begin
  if new.work_done_at is null or old.work_done_at is not null or new.live_code is null then return null; end if;
  insert into public.chat_rooms (kind, job_id) values ('cust', new.id) on conflict do nothing;
  select id into rid from public.chat_rooms where kind = 'cust' and job_id = new.id;
  -- 수금 담당 이름으로 올림 → 대표님·관리자에게 '작업 끝' 알림이 감 (고객님 화면엔 '리츠종합클린 현장팀')
  insert into public.chat_messages (room_id, staff_id, admin_uid, body)
    values (rid, new.collector_id, case when new.collector_id is null then auth.uid() end, '✅ 작업이 모두 끝났어요. 고생한 현장팀을 대신해 감사 인사드려요!' || E'\n' ||
                            '위쪽 완료 리포트에서 전·후 사진과 잔금 안내를 확인해 주세요.' || E'\n' ||
                            '불편한 곳이 있으면 이 방에 편하게 남겨주세요 (' || days || '일 뒤 이 방은 닫혀요).');
  return null;
exception when others then return null;
end $$;


-- 추가금 적기 (그날 수금 담당만, 작업 마감 전까지)
create or replace function public.staff_add_extra(p_token text, p_job bigint, p_name text, p_amount int)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); j public.jobs;
begin
  select * into j from public.jobs where id = p_job;
  if j.id is null or j.collector_id is distinct from s.id then raise exception '수금 담당만 적을 수 있어요'; end if;
  if j.status in ('done','cancelled') then raise exception '마감된 현장이에요'; end if;
  if coalesce(p_amount,0) <= 0 or p_amount > 5000000 then raise exception '금액을 확인해주세요'; end if;
  update public.jobs set extras = coalesce(extras,'[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'name', left(coalesce(nullif(trim(p_name),''),'현장 추가'),40), 'amount', p_amount,
      'notice','site', 'agreed', true, 'by', s.id, 'by_name', s.name, 'at', now()))
   where id = p_job;
  return 'ok';
end $$;
grant execute on function public.staff_add_extra(text, bigint, text, int) to anon, authenticated;

-- 내가 적은 추가금 지우기 (idx = 목록 순서)
create or replace function public.staff_del_extra(p_token text, p_job bigint, p_idx int)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); j public.jobs; x jsonb;
begin
  select * into j from public.jobs where id = p_job;
  if j.id is null or j.collector_id is distinct from s.id then raise exception '수금 담당만 지울 수 있어요'; end if;
  if j.status in ('done','cancelled') then raise exception '마감된 현장이에요'; end if;
  x := j.extras -> p_idx;
  if x is null or (x->>'by') is distinct from s.id::text then raise exception '직접 적은 것만 지울 수 있어요'; end if;
  update public.jobs set extras = extras - p_idx where id = p_job;
  return 'ok';
end $$;
grant execute on function public.staff_del_extra(text, bigint, int) to anon, authenticated;

-- 도급 사장님이 확정된 현장은 인원 완료로 (지금 모집 중으로 남아 있는 것 정리)
update public.jobs j set status = 'full'
 where j.status = 'open'
   and exists (select 1 from public.assignments a join public.staff st on st.id = a.staff_id
                where a.job_id = j.id and a.status = 'approved' and st.team = 'PRT');

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(30, 0) $$;

select '업데이트 완료 (v30) · 도급 화면: 평수·고객님 방·추가금' as result;
