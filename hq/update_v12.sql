-- ============================================================
--  어닝플레이스 HQ 업데이트 v12 (2026-10-27)
--  대화방 아이콘: 대표가 고른 방 아이콘을 직원 화면에서도 보이게
-- ============================================================
create or replace function public.chat_icons() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce((select value from public.settings where key = 'chat_icons'), '{}'::jsonb)
$$;
grant execute on function public.chat_icons() to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 12 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v12)' as result;
