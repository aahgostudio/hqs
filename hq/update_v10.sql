-- ============================================================
--  어닝플레이스 HQ 업데이트 v10 (2026-10-27)
--  이름 바꾸기: '청소' → '클린' (청소만 하는 게 아니라서) · 부동산은 그대로
--  Supabase → SQL Editor → 붙여넣고 Run → '업데이트 완료 (v10)'
-- ============================================================
update public.teams set name = replace(name, '청소', '클린') where name like '%청소%';

create or replace function public._chat_grp_title(p_grp text) returns text language sql immutable as $$
  select case p_grp when 'clean' then '클린팀' when 'res' then '부동산팀'
                    when 'prt' then '도급 파트너' when 'ago' then '아고스튜디오' else p_grp end
$$;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 10 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v10)' as result;
