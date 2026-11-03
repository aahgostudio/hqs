-- ============================================================
--  어닝플레이스 HQ 업데이트 v33 (2026-11-04)
--  팀별 현황 (직원 화면 · 내 일정 탭)
--   · 팀장: 내가 맡은 현장 + 나랑 같이 간 사람·짝
--   · 실장: 팀장·실장 전체 카드 + 모든 짝 (대표님 카드는 빼고)
--   · 금액·고객 정보는 없음. 사고 = 운영 › CS·품질에 클레임·재방문 적은 현장
-- ============================================================
create or replace function public.staff_team_stats(p_token text, p_month date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.staff := public._me(p_token);
  lv text := case when coalesce(s.role,'') like '%실장%' then 'chief' when coalesce(s.role,'') like '%팀장%' then 'lead' end;
  m0 date := date_trunc('month', p_month)::date;
  m1 date := least((date_trunc('month', p_month) + interval '1 month - 1 day')::date, public._today());
begin
  if lv is null then return jsonb_build_object('level', null); end if;
  return jsonb_build_object(
    'level', lv,
    'me', jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role),
    'month', to_char(m0, 'YYYY-MM'),
    'rows', coalesce((select jsonb_agg(jsonb_build_object(
        'collector_id', j.collector_id,
        'bad', (coalesce(j.cs->>'claim','') <> '' or coalesce(j.cs->>'revisit','') in ('true','1','yes')),
        'crew', coalesce((select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'role', st.role, 'team', st.team))
                  from public.assignments a join public.staff st on st.id = a.staff_id
                 where a.job_id = j.id and a.status = 'approved'), '[]'::jsonb),
        'helpers', coalesce((select jsonb_agg('외부 ' || (h->>'name')) from jsonb_array_elements(coalesce(j.helpers,'[]'::jsonb)) h), '[]'::jsonb)))
      from public.jobs j
     where j.job_date between m0 and m1 and j.status not in ('cancelled','quote')
       and (lv = 'chief' or exists (select 1 from public.assignments a where a.job_id = j.id and a.staff_id = s.id and a.status = 'approved'))
    ), '[]'::jsonb));
end $$;
grant execute on function public.staff_team_stats(text, date) to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(33, 0) $$;

select '업데이트 완료 (v33) · 팀장·실장 팀별 현황' as result;
