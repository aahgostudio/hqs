-- ============================================================
--  어닝플레이스 HQ 업데이트 v36 (2026-11-04)
--  대표님 출퇴근부
--   · HQ 상단 칩에서 [사무실] [외근] [현장] [퇴근] 찍기 → 시간 기록
--   · 직원 화면 오른쪽 위 칩이 찍은 대로 바뀜 (통화불가·휴무는 지금처럼 직접 고르면 그게 먼저)
--   · 대표님 휴무 날짜 표시
--   · 직원 달력: 대표님 근무한 날 초록 점 · 휴무 분홍 점 (누르면 시간 한 줄)
-- ============================================================
create table if not exists public.boss_punch (
  id bigserial primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('office','out','site','off')),
  created_at timestamptz not null default now()
);
create index if not exists boss_punch_at on public.boss_punch (at);
create table if not exists public.boss_rest (
  day date primary key,
  memo text
);
alter table public.boss_punch enable row level security;
alter table public.boss_rest enable row level security;
drop policy if exists "owner_all" on public.boss_punch;
drop policy if exists "owner_all" on public.boss_rest;
drop policy if exists "admin_read" on public.boss_punch;
drop policy if exists "admin_read" on public.boss_rest;
create policy "owner_all" on public.boss_punch for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner_all" on public.boss_rest for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "admin_read" on public.boss_rest for select to authenticated using (public.is_admin());

-- 대표 상태: 직접 고른 상태(통화불가·휴가 등)가 살아 있으면 그게 먼저, 아니면 오늘 마지막으로 찍은 것
create or replace function public.boss_status() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  with v as (select coalesce((select value from public.settings where key = 'boss_status'), '{"state":"근무중"}'::jsonb) v),
       m as (select case when v ? 'until' and nullif(v->>'until','') is not null and (v->>'until')::timestamptz < now()
                         then jsonb_build_object('state','근무중','memo','','until',null) else v end m from v),
       p as (select kind, at from public.boss_punch
              where (at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date
              order by at desc limit 1),
       f as (select min(at) at from public.boss_punch
              where (at at time zone 'Asia/Seoul')::date = (now() at time zone 'Asia/Seoul')::date)
  select case
    when (select m->>'state' from m) <> '근무중' then (select m from m)
    when exists (select 1 from public.boss_rest where day = (now() at time zone 'Asia/Seoul')::date) and not exists (select 1 from p)
      then jsonb_build_object('state','휴가중','memo',(select m->>'memo' from m),'until',null,'punch',true)
    when exists (select 1 from p) then jsonb_build_object(
      'state', case (select kind from p) when 'office' then '내근중' when 'out' then '외근중' when 'site' then '현장 근무중' else '업무 종료' end,
      'memo', (select m->>'memo' from m), 'until', null, 'punch', true,
      'since', (select at from p), 'start', (select at from f))
    else (select m from m) end
$$;
grant execute on function public.boss_status() to anon, authenticated;

-- 직원 달력용: 대표님 근무한 날(처음 찍은 시간 – 퇴근) · 휴무 날 — 시간만, 자세한 기록은 안 줌
create or replace function public.staff_boss_days(p_token text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  return coalesce((
    select jsonb_agg(x order by x->>'day') from (
      select jsonb_build_object('day', d, 'kind', 'work',
               'from', to_char(min(at) at time zone 'Asia/Seoul', 'HH24:MI'),
               'to', case when bool_or(kind = 'off') then to_char(max(at) filter (where kind = 'off') at time zone 'Asia/Seoul', 'HH24:MI') end) x
        from (select (at at time zone 'Asia/Seoul')::date d, at, kind from public.boss_punch) q
       where d between p_from and p_to
       group by d
      union all
      select jsonb_build_object('day', r.day, 'kind', 'rest') from public.boss_rest r
       where r.day between p_from and p_to
         and not exists (select 1 from public.boss_punch b where (b.at at time zone 'Asia/Seoul')::date = r.day)
    ) z), '[]'::jsonb);
end $$;
grant execute on function public.staff_boss_days(text, date, date) to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(36, 0) $$;

select '업데이트 완료 (v36) · 대표님 출퇴근부' as result;
