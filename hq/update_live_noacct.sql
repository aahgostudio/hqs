-- ============================================================
--  도급 현장: 작업 끝나도 고객님께 우리 계좌·잔금 안내 안 감 (2026-11-05)
--   · A(예약금만 본사)·B(전액 받고 잔금 송금) 둘 다 해당
--   · 완료 리포트: 계좌 이미지·계좌번호·잔금 카드 숨김 (사진·후기는 그대로)
--   · 작업 끝 인사 글에서도 '잔금 안내' 문구 뺌
-- ============================================================
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
    'paid', (j.collected_at is not null),
    'photos', case when st = 'closed' then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('path', p.path, 'stage', p.stage, 'memo', p.memo, 'at', p.created_at) order by p.created_at desc)
          from public.job_photos p where p.job_id = j.id and not p.hidden and coalesce(p.bucket, 'live') = 'live'), '[]'::jsonb) end
  );
end $$;
grant execute on function public.live_view(text, boolean) to anon, authenticated;

create or replace function private.on_work_done() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
declare rid bigint; days int := coalesce(new.live_close_days, 7);
begin
  if new.work_done_at is null or old.work_done_at is not null or new.live_code is null then return null; end if;
  insert into public.chat_rooms (kind, job_id) values ('cust', new.id) on conflict do nothing;
  select id into rid from public.chat_rooms where kind = 'cust' and job_id = new.id;
  -- 수금 담당 이름으로 올림 → 대표님·관리자에게 '작업 끝' 알림이 감 (고객님 화면엔 '리츠종합클린 현장팀')
  insert into public.chat_messages (room_id, staff_id, admin_uid, body)
    values (rid, new.collector_id, case when new.collector_id is null then auth.uid() end, '✅ 작업이 모두 끝났어요. 고생한 현장팀을 대신해 감사 인사드려요!' || E'\n' ||
                            case when new.contract_mode is null then '위쪽 완료 리포트에서 전·후 사진과 잔금 안내를 확인해 주세요.' else '위쪽 완료 리포트에서 전·후 사진을 확인해 주세요.' end || E'\n' ||
                            '불편한 곳이 있으면 이 방에 편하게 남겨주세요 (' || days || '일 뒤 이 방은 닫혀요).');
  return null;
exception when others then return null;
end $$;

select '업데이트 완료 · 도급 현장 계좌 안내 끔' as result;
