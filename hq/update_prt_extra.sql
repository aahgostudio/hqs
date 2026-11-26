-- 1126 도급 추가금 중 본사로 온 돈 (현장마다 직접 적기 · 비우면 절반)
alter table public.jobs add column if not exists prt_hq_extra integer;
notify pgrst, 'reload schema';
select 'ok' as result, count(*) filter (where prt_hq_extra is not null) as filled from public.jobs;
