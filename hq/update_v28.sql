-- 업데이트 v28 (2026-10-31): 대표 구글 캘린더 구독에 청소 현장도 같이 보이게
-- 기존 '부동산 직원 일정 구독 주소'(HQ 홈 › 구독 주소 복사)를 그대로 쓰면 됩니다. 주소는 안 바뀌어요.
-- 제목 규칙 (카카오워크 때와 같은 머리글):
--   완·  = 인원 다 찬 현장(또는 마감 끝)      미수· = 지난 현장인데 잔금 수금 기록 없음
--   견적· = 견적 방문 일정                      [부동산] = 부동산 직원 계약·잔금·안내
--   끝에 (확정/필요 인원), 도급 현장은 · 도급, 대표 참석은 · 대표

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
             ) x
        from public.jobs j
        cross join lateral (select count(*)::int n from public.assignments a where a.job_id = j.id and a.status = 'approved') ap
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

select '업데이트 완료 (v28) · 대표 캘린더 구독에 청소 현장 추가' as result;
