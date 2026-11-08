-- 고객에게 돌려준 돈 (페이백 · 클레임) (2026-11-08)
alter table public.jobs add column if not exists refunds jsonb not null default '[]'::jsonb;
notify pgrst, 'reload schema';
select '업데이트 완료 · 페이백·클레임' as result;
