-- ============================================================
--  어닝플레이스 HQ 업데이트 v32 (2026-11-04)
--  같이 가는 사람 보기
--   · 확정된 모두: 이름에 대표님·외부지원까지 보임, 인원 수도 같이 셈 (도급 확정 = 인원 완료)
--   · 팀장(수금 가능)·수금 담당: 같이 가는 사람 전화 버튼
--  ※ v30을 먼저 실행해야 해요
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
          -- v32: 확정 인원 = 직원 + 대표님 + 외부지원
          'approved', case when exists (select 1 from public.assignments a join public.staff st on st.id = a.staff_id
                                         where a.job_id = j.id and a.status = 'approved' and st.team = 'PRT') then j.headcount   -- 도급 확정 = 인원 완료
                      else (select count(*) from public.assignments a where a.job_id = j.id and a.status = 'approved')
                           + case when j.boss_on then 1 else 0 end + jsonb_array_length(coalesce(j.helpers,'[]'::jsonb)) end,
          'crew', coalesce((select jsonb_agg(st.name order by a.decided_at)
                     from public.assignments a join public.staff st on st.id = a.staff_id
                    where a.job_id = j.id and a.status = 'approved'), '[]'::jsonb)
                  || case when j.boss_on then '["대표"]'::jsonb else '[]'::jsonb end
                  || coalesce((select jsonb_agg('외부 ' || (h->>'name')) from jsonb_array_elements(coalesce(j.helpers,'[]'::jsonb)) h), '[]'::jsonb),
          -- v32: 같이 가는 사람 연락처 — 확정된 팀장(수금 가능)·수금 담당만
          'crew_info',    case when my.status = 'approved' and (j.collector_id = s.id or s.can_collect) then
                  coalesce((select jsonb_agg(jsonb_build_object('name', st.name, 'phone', st.phone, 'kind', 'staff') order by a.decided_at)
                     from public.assignments a join public.staff st on st.id = a.staff_id
                    where a.job_id = j.id and a.status = 'approved' and st.id <> s.id), '[]'::jsonb)
                  || case when j.boss_on then jsonb_build_array(jsonb_build_object('name', '대표', 'kind', 'boss',
                        'phone', (select value->>'phone' from public.settings where key = 'live'))) else '[]'::jsonb end
                  || coalesce((select jsonb_agg(jsonb_build_object('name', h->>'name', 'phone', h->>'phone', 'kind', 'ext'))
                        from jsonb_array_elements(coalesce(j.helpers,'[]'::jsonb)) h), '[]'::jsonb) end,
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

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(32, 0) $$;

select '업데이트 완료 (v32) · 같이 가는 사람 보기' as result;
