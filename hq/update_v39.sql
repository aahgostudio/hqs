-- ============================================================
--  어닝플레이스 HQ 업데이트 v39 (2026-11-04)
--  직원 생일 (월-일만) — 대표님 홈에 '오늘 챙길 사람'으로 알림
-- ============================================================
alter table public.staff add column if not exists birthday text;   -- 예: '03-15' (연도 없이)

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(39, 0) $$;

select '업데이트 완료 (v39) · 직원 생일' as result;
