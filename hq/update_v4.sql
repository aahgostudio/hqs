-- ============================================================
--  어닝플레이스 HQ 업데이트 v4 (2026-10-27)
--  카카오워크 졸업: 대표님이 가는 현장을 일정판에서 표시 → 직원 화면 대표 상태 '현장 근무중' 자동
--  Supabase → SQL Editor → 붙여넣고 Run → '업데이트 완료 (v4)'
-- ============================================================
alter table public.jobs add column if not exists boss_on boolean not null default false;
update public.jobs set boss_on = true where public_note like '대표 현장%' or admin_memo like '대표 현장%';

-- 오늘 대표님이 가는 현장 시간만 (주소·손님 정보 없음)
create or replace function public.boss_jobs_today() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object('t', to_char(start_time, 'HH24:MI'), 'k', kind) order by start_time), '[]'::jsonb)
    from public.jobs
   where boss_on and job_date = (now() at time zone 'Asia/Seoul')::date
     and status not in ('cancelled', 'quote') and start_time is not null
$$;
grant execute on function public.boss_jobs_today() to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 4 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v4)' as result;
