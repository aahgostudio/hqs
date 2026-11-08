-- 용달 (2026-11-08): 도착지 · 차량
alter table public.jobs
  add column if not exists dest_address text,
  add column if not exists vehicle text;
notify pgrst, 'reload schema';
select '업데이트 완료 · 용달' as result;
