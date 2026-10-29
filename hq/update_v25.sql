-- ============================================================
--  어닝플레이스 HQ 업데이트 v25 (2026-10-30)
--  고객님 방에 올린 사진 = 현장 사진 (따로 올리지 않음)
--   · 직원이 고객님 방에 올린 사진·동영상은 자동으로 HQ 사진함·홍보 재료로 모임 (설명 글도 같이)
--   · 작업 끝 전 = '작업 중', 작업 끝 뒤 = '작업 후' 사진으로 분류 (홍보 만들 때 클로가 다시 정리)
--   · 고객 화면에는 대화 속 사진으로만 한 번 보임 (중복 없음)
-- ============================================================
alter table public.job_photos add column if not exists bucket text not null default 'live';
alter table public.job_photos add column if not exists chat_msg bigint;
create unique index if not exists job_photos_chat_msg on public.job_photos (chat_msg) where chat_msg is not null;

create or replace function private.on_cust_photo() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
declare r public.chat_rooms; j public.jobs;
begin
  if new.photo is null or new.cust or new.deleted_at is not null then return null; end if;
  if new.photo !~* '\.(jpe?g|png|webp|heic|heif|gif|mov|mp4|m4v|webm|3gp)$' then return null; end if;   -- 문서 파일은 제외
  select * into r from public.chat_rooms where id = new.room_id;
  if r.kind <> 'cust' or r.job_id is null then return null; end if;
  select * into j from public.jobs where id = r.job_id;
  insert into public.job_photos (job_id, staff_id, path, stage, memo, bucket, chat_msg)
    values (j.id, new.staff_id, new.photo, case when j.work_done_at is not null then 'after' else 'during' end,
            nullif(left(trim(coalesce(new.body, '')), 200), ''), 'chat', new.id)
    on conflict do nothing;
  update public.jobs set promo = jsonb_set(coalesce(promo, '{}'::jsonb), '{photo}', '1') where id = j.id;
  return null;
exception when others then return null;
end $$;
drop trigger if exists chat_cust_photo on public.chat_messages;
create trigger chat_cust_photo after insert on public.chat_messages for each row execute function private.on_cust_photo();

-- 지금까지 고객님 방에 올라온 사진도 한 번 모으기
insert into public.job_photos (job_id, staff_id, path, stage, memo, bucket, chat_msg)
select r.job_id, m.staff_id, m.photo, 'during', nullif(left(trim(coalesce(m.body, '')), 200), ''), 'chat', m.id
  from public.chat_messages m join public.chat_rooms r on r.id = m.room_id
 where r.kind = 'cust' and r.job_id is not null and m.photo is not null and not m.cust and m.deleted_at is null
   and m.photo ~* '\.(jpe?g|png|webp|heic|heif|gif|mov|mp4|m4v|webm|3gp)$'
on conflict do nothing;

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
    'balance', case when st = 'done' then j.balance_amount end,
    'pay_total', case when st = 'done' then bal end,
    'paid', (j.collected_at is not null),
    'photos', case when st = 'closed' then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('path', p.path, 'stage', p.stage, 'memo', p.memo, 'at', p.created_at) order by p.created_at desc)
          from public.job_photos p where p.job_id = j.id and not p.hidden and coalesce(p.bucket, 'live') = 'live'), '[]'::jsonb) end
  );
end $$;
grant execute on function public.live_view(text, boolean) to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 25 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v25)' as result;
