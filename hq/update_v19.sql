-- ============================================================
--  어닝플레이스 HQ 업데이트 v19 (2026-10-29)
--  고객 이름 · 전화번호 칸
--   · 현장(jobs)에 고객 이름(cust_name) · 고객 전화(cust_phone) 칸 추가
--   · 직원 일정판: 수금 담당으로 지정된 사람한테만 이름·전화가 보임
--   · 상세 주소는 지금처럼 확정자만 (현장 이름=동까지는 팀 전체)
-- ============================================================
alter table public.jobs add column if not exists cust_name  text;
alter table public.jobs add column if not exists cust_phone text;

-- 예전에 대표 메모에 "고객 홍길동 010-…" 로 들어간 건 칸으로 옮겨줌 (메모는 그대로 둠)
update public.jobs set
  cust_phone = coalesce(cust_phone, (regexp_match(admin_memo, '(01[016789][-\s.]?\d{3,4}[-\s.]?\d{4})'))[1]),
  cust_name  = coalesce(cust_name, nullif(trim((regexp_match(admin_memo, '^고객\s+([^\s·0-9]+)'))[1]), ''))
where admin_memo ~ '^고객\s' and job_date >= current_date - 30;

create or replace function public.staff_board(p_token text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.staff := public._me(p_token);
  out jsonb;
begin
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
          'work_done',    case when my.status = 'approved' then j.work_done_at end
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
language sql stable as $$ select 19 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v19)' as result;
