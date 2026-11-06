-- ============================================================
--  어닝플레이스 HQ 업데이트 v44 (2026-11-06)
--  빈 날 특가 — 오늘부터 14일 안에 현장이 비어 있는 날만 10% 할인
--  · settings 'deal' : {rate:10, days:14, cap:2, off:[쉬는 날 'YYYY-MM-DD']}
--  · deal_days()     : 빈 날 목록 (날짜·오전/오후 빈자리만, 현장 정보는 안 나감)
--                      → 파트너 화면·숨고 견적 점검·HQ에서 같이 씀
--  · 도급 현장은 우리 직영 팀 일정을 막지 않으니 빈자리 계산에서 뺌
-- ============================================================
insert into public.settings (key, value)
values ('deal', '{"rate":10,"days":14,"cap":2,"off":[]}'::jsonb)
on conflict (key) do nothing;

create or replace function public.deal_days() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cfg jsonb; rate int; ndays int; cap int; d date; am boolean; pm boolean; n int; nt int;
        out jsonb := '[]'::jsonb; t0 date := (now() at time zone 'Asia/Seoul')::date;
begin
  select value into cfg from public.settings where key = 'deal';
  cfg := coalesce(cfg, '{}'::jsonb);
  rate := coalesce((cfg->>'rate')::int, 10); ndays := coalesce((cfg->>'days')::int, 14); cap := coalesce((cfg->>'cap')::int, 2);
  for i in 1..ndays loop
    d := t0 + i;
    continue when coalesce(cfg->'off', '[]'::jsonb) ? to_char(d, 'YYYY-MM-DD');
    select count(*), count(*) filter (where start_time is null) into n, nt
      from public.jobs j
     where j.job_date = d and coalesce(j.status,'') not in ('cancelled','quote')
       and not ('PRT' = any(coalesce(j.teams,'{}'::text[])) or j.contract_mode is not null);
    continue when n >= cap;
    am := not exists (select 1 from public.jobs j where j.job_date = d and coalesce(j.status,'') not in ('cancelled','quote')
                        and not ('PRT' = any(coalesce(j.teams,'{}'::text[])) or j.contract_mode is not null) and j.start_time < '12:00');
    pm := not exists (select 1 from public.jobs j where j.job_date = d and coalesce(j.status,'') not in ('cancelled','quote')
                        and not ('PRT' = any(coalesce(j.teams,'{}'::text[])) or j.contract_mode is not null) and j.start_time >= '12:00');
    -- 시간 안 정한 현장(시간 무관)은 빈 쪽 하나를 차지한다고 봄
    if nt > 0 then if am then am := false; elsif pm then pm := false; end if; end if;
    continue when not am and not pm;
    out := out || jsonb_build_object('d', to_char(d, 'YYYY-MM-DD'), 'dow', extract(dow from d)::int, 'am', am, 'pm', pm);
  end loop;
  return jsonb_build_object('rate', rate, 'days', out);
end $$;
grant execute on function public.deal_days() to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(44, 0) $$;

select '업데이트 완료 (v44) · 빈 날 특가' as result;
