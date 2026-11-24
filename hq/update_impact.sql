-- 리츠 효과 기록판 (2026-11-24) · 이미 쌓인 기록으로 '오피니가 아껴준 시간·돈'을 계산 (대표만)
create or replace function public.boss_impact(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare f timestamptz := p_from::timestamptz; t timestamptz := (p_to + 1)::timestamptz; r jsonb;
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  with sysmsg as (   -- 자동 알림 (새 현장·내일 일정·변경·인원 마감)
    select m.created_at, m.body from public.chat_messages m
     where m.staff_id is null and m.admin_uid is null and not m.cust and m.created_at >= f and m.created_at < t
  ), custmsg as (    -- 고객님 방에 직원·대표가 보낸 글·사진
    select m.created_at from public.chat_messages m join public.chat_rooms r on r.id = m.room_id
     where r.kind = 'cust' and not m.cust and (m.staff_id is not null or m.admin_uid is not null) and m.created_at >= f and m.created_at < t
  ), bossdm as (     -- 대표가 직원에게 직접 보낸 글 (1:1·팀방)
    select m.created_at from public.chat_messages m join public.chat_rooms r on r.id = m.room_id
     where r.kind in ('dm','team','all','site','custom') and m.staff_id is null and m.admin_uid is not null and m.created_at >= f and m.created_at < t
  ), pays as (
    select p.created_at from public.payouts p where not p.void and p.created_at >= f and p.created_at < t
  ), late as (       -- 현장 다음 날 이후에 받은 잔금 (미수 알림 뒤 회수)
    select coalesce(j.balance_amount, 0) amt from public.jobs j
     where j.collected_at >= f and j.collected_at < t and j.collected_at::date > j.job_date + 1
  ), lated as (      -- 올린 다음 날 이후에 받은 예약금
    select coalesce(j.deposit_amount, 0) amt from public.jobs j
     where j.deposit_paid_at >= f and j.deposit_paid_at < t and j.deposit_paid_at > j.created_at + interval '1 day'
  ), cj as (
    select j.* from public.jobs j where j.job_date between p_from and p_to and j.status not in ('cancelled','quote')
  ), croom as (
    select r.id, exists (select 1 from public.chat_reads x where x.room_id = r.id and x.who = 'cust') opened
      from public.chat_rooms r join cj on cj.id = r.job_id where r.kind = 'cust'
  )
  select jsonb_build_object(
    'auto',        (select count(*) from sysmsg),
    'changes',     (select count(*) from sysmsg where body like '⚠️%' or body like '❌%'),
    'cust_sent',   (select count(*) from custmsg),
    'boss_dm',     (select count(*) from bossdm),
    'pays',        (select count(*) from pays),
    'late_n',      (select count(*) from late) + (select count(*) from lated),
    'late_amt',    (select coalesce(sum(amt),0) from late) + (select coalesce(sum(amt),0) from lated),
    'unpaid_n',    (select count(*) from cj where cj.job_date < current_date - 7 and coalesce(cj.balance_amount,0) > 0 and cj.collected_at is null and cj.contract_mode is distinct from 'A'),
    'jobs',        (select count(*) from cj),
    'photos',      (select count(*) from public.job_photos p where p.created_at >= f and p.created_at < t),
    'diary',       (select count(*) from public.diary_comment d where d.created_at >= f and d.created_at < t and not d.hidden),
    'assign',      (select count(*) from public.assignments a join cj on cj.id = a.job_id where a.status = 'approved'),
    'staff_all',   (select count(*) from public.staff s where s.status <> 'left' and not s.hidden and coalesce(s.team,'') not in ('RES','AGO')),
    'staff_7d',    (select count(*) from public.staff s where s.status <> 'left' and not s.hidden and coalesce(s.team,'') not in ('RES','AGO') and s.last_seen_at > now() - interval '7 days'),
    'cust_rooms',  (select count(*) from croom),
    'cust_open',   (select count(*) from croom where opened),
    'regular',     (select count(distinct series_id) from cj where series_id is not null),
    'weeks', (select coalesce(jsonb_agg(w order by w->>'w'), '[]'::jsonb) from (
       select jsonb_build_object('w', to_char(wk, 'YYYY-MM-DD'),
         'auto', (select count(*) from public.chat_messages m where m.staff_id is null and m.admin_uid is null and not m.cust and m.created_at >= wk and m.created_at < wk + interval '7 days'),
         'cust', (select count(*) from public.chat_messages m join public.chat_rooms r on r.id = m.room_id where r.kind = 'cust' and not m.cust and (m.staff_id is not null or m.admin_uid is not null) and m.created_at >= wk and m.created_at < wk + interval '7 days'),
         'pays', (select count(*) from public.payouts p where not p.void and p.created_at >= wk and p.created_at < wk + interval '7 days')) w
       from generate_series(date_trunc('week', p_to::timestamptz) - interval '5 weeks', date_trunc('week', p_to::timestamptz), interval '7 days') wk) q)
  ) into r;
  return r;
end $$;
grant execute on function public.boss_impact(date, date) to authenticated;
select '업데이트 완료 · 리츠 효과 기록판' as result;
