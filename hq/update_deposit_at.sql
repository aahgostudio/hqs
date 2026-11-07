-- ============================================================
--  예약금 받은 날 기록 (2026-11-07)
--   · '예약금 받음' 체크하는 순간 날짜가 자동으로 찍힘 (풀면 지워짐)
--   · 홈 '예약금 받음 (이번 달)' = 이번 달에 실제로 받은 예약 건수·금액
--   · 지난 건은 받은 날을 모르니 현장 등록일로 채움 (대략)
-- ============================================================
alter table public.jobs add column if not exists deposit_paid_at timestamptz;

do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'jobs' and column_name = 'created_at') then
    execute 'update public.jobs set deposit_paid_at = created_at where deposit_paid and deposit_paid_at is null';
  else
    update public.jobs set deposit_paid_at = job_date::timestamptz where deposit_paid and deposit_paid_at is null;
  end if;
end $$;

create or replace function private.stamp_deposit() returns trigger
language plpgsql as $$
begin
  if new.deposit_paid and new.deposit_paid_at is null then new.deposit_paid_at := now(); end if;
  if not new.deposit_paid then new.deposit_paid_at := null; end if;
  return new;
end $$;
drop trigger if exists jobs_stamp_deposit on public.jobs;
create trigger jobs_stamp_deposit before insert or update of deposit_paid on public.jobs
  for each row execute function private.stamp_deposit();

create index if not exists jobs_deposit_paid_at on public.jobs (deposit_paid_at) where deposit_paid;
notify pgrst, 'reload schema';

select '업데이트 완료 · 예약금 받은 날 기록' as result;
