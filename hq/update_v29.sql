-- 업데이트 v29 (2026-11-01): 외부지원(일용직) 인원 — 그 현장에만 붙는 임시 인원
-- 직원 명단에는 안 들어가고, 현장 카드에 '외부 · 이름'으로 보이고, 인원 수·당일 마감·정산에 같이 잡혀요.
-- helpers = [{id, name, phone, src, pay, extra, memo, paid, paid_at}]   (금액 공제 없이 그대로 지급)

alter table public.jobs add column if not exists helpers jsonb not null default '[]';

-- 대표 캘린더 구독: 인원 수에 대표·외부지원 포함 + 제목 끝에 '· 외부N'
create or replace function public.boss_ics(p_key text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p_key is null or p_key is distinct from (select value #>> '{}' from public.settings where key = 'ics_key') then
    raise exception 'not_allowed';
  end if;
  return jsonb_build_object('name', '일정판 (청소·부동산)', 'items', coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object(
               'uid', 'job-'||j.id,
               'date', j.job_date,
               'time', to_char(j.start_time,'HH24:MI'),
               'dur', 240,
               'title',
                 case
                   when j.status = 'quote' then '견적·'
                   when j.job_date < public._today() and coalesce(j.balance_amount,0) > 0
                        and j.collector_id is not null and j.collected_at is null then '미수·'
                   when j.status = 'done' or ap.n >= coalesce(j.headcount,0) then '완·'
                   else ''
                 end
                 || '청소 ' || j.title
                 || case when j.status = 'quote' then '' else ' ('||ap.n||'/'||coalesce(j.headcount,0)||'명)' end
                 || case when 'PRT' = any(coalesce(j.teams,'{}'::text[])) or j.contract_mode is not null then ' · 도급' else '' end
                 || case when j.boss_on then ' · 대표' else '' end
                 || case when coalesce(jsonb_array_length(j.helpers),0) > 0 then ' · 외부'||jsonb_array_length(j.helpers) else '' end
             ) x
        from public.jobs j
        cross join lateral (select (select count(*)::int from public.assignments a where a.job_id = j.id and a.status = 'approved')
                                  + case when j.boss_on then 1 else 0 end
                                  + coalesce(jsonb_array_length(j.helpers), 0) as n) ap
       where j.status <> 'cancelled'
         and j.job_date between public._today() - 60 and public._today() + 120
      union all
      select jsonb_build_object('uid', 'ev-'||e.id, 'date', e.ev_date, 'time', to_char(e.ev_time,'HH24:MI'), 'dur', 60,
             'title', '[부동산] '||st.name||' · '||e.kind||' '||coalesce(e.maemul_id||' ','')||e.title)
        from public.events e join public.staff st on st.id = e.staff_id
       where e.show_boss and st.team = 'RES' and e.ev_date between public._today() - 60 and public._today() + 120
    ) q), '[]'::jsonb));
end $$;

grant execute on function public.boss_ics(text) to anon, authenticated;


create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(29, 0) $$;

select '업데이트 완료 (v29) · 외부지원 인원' as result;
