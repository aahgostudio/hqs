-- 고객님 방: 오늘 담당 카드 (2026-11-08)
create or replace function public.live_view(p_code text, p_count boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare j public.jobs; cfg jsonb; st text; close_at timestamptz; extra int; bal int;
begin
  select * into j from public.jobs where live_code = p_code and status <> 'cancelled';
  if not found or length(coalesce(p_code,'')) < 6 then raise exception 'not_found'; end if;
  cfg := coalesce((select value from public.settings where key = 'live'), '{}'::jsonb);
  close_at := coalesce(j.work_done_at, j.done_at) + make_interval(days => j.live_close_days);
  st := case when j.live_closed or (close_at is not null and close_at < now()) then 'closed'
             when j.work_done_at is not null or j.status = 'done' then 'done'
             else 'live' end;
  if p_count then update public.jobs set live_views = live_views + 1 where id = j.id; end if;
  select coalesce(sum((e->>'amount')::int),0) into extra
    from jsonb_array_elements(j.extras) e where coalesce((e->>'agreed')::boolean, true);
  bal := case when j.balance_amount is null then null else j.balance_amount + extra end;
  return jsonb_build_object(
    'state', st,
    'title', coalesce(nullif(j.live_title,''), j.title),
    'kind', j.kind,
    'date', j.job_date,
    'time', to_char(j.start_time,'HH24:MI'),
    'done_at', coalesce(j.work_done_at, j.done_at),
    'close_at', close_at,
    'cfg', cfg - 'show_staff',
    'crew', case when coalesce((cfg->>'show_staff')::boolean,false) then
              (select jsonb_agg(st2.name) from public.assignments a join public.staff st2 on st2.id = a.staff_id
                where a.job_id = j.id and a.status = 'approved') end,
    'extras', case when st <> 'live' then (select coalesce(jsonb_agg(jsonb_build_object('name', e->>'name', 'amount', (e->>'amount')::int)),'[]'::jsonb)
                from jsonb_array_elements(j.extras) e where coalesce((e->>'agreed')::boolean, true)) end,
    'balance', case when st = 'done' and j.contract_mode is null then j.balance_amount end,
    'pay_total', case when st = 'done' and j.contract_mode is null then bal end,   -- 도급은 잔금·계좌 안내 안 함
    'no_acct', (j.contract_mode is not null),
    -- 1108: 오늘 담당(수금 담당 = 현장 책임자) 이름·직급, 작업 인원 수 — 전화번호는 안 줌
    'mgr', (select jsonb_build_object('name', s.name, 'role', coalesce(nullif(s.role,''), '')) from public.staff s where s.id = j.collector_id),
    'crew_n', (select count(*)::int from public.assignments a where a.job_id = j.id and a.status = 'approved') + case when j.boss_on then 1 else 0 end,
    'paid', (j.collected_at is not null),
    'photos', case when st = 'closed' then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('path', p.path, 'stage', p.stage, 'memo', p.memo, 'at', p.created_at) order by p.created_at desc)
          from public.job_photos p where p.job_id = j.id and not p.hidden and coalesce(p.bucket, 'live') = 'live'), '[]'::jsonb) end
  );
end $$;
grant execute on function public.live_view(text, boolean) to anon, authenticated;

select '업데이트 완료 · 고객님 방 담당 카드' as result;
