-- ============================================================
--  어닝플레이스 HQ 업데이트 v26 (2026-10-30)
--  고객님 방: 고객님이 링크에 들어왔는지 보이게
--   · 고객님이 링크를 열면 처음 들어온 시간 · 마지막으로 본 시간 · 연 횟수를 저장
--   · 직원·HQS 고객님 방 위쪽에 '👀 지금 보는 중 / 10:02 확인 / 아직 안 들어오셨어요'
--   · 직원이 보낸 글 옆에 '고객님 읽음' 표시
-- ============================================================
alter table public.jobs add column if not exists live_first_at timestamptz;
alter table public.jobs add column if not exists live_seen_at  timestamptz;

-- 고객님 화면이 열려 있는 동안 30초마다 호출 (링크가 닫혀 있어도 조용히 무시)
create or replace function public.live_ping(p_code text) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if length(coalesce(p_code, '')) < 6 then return 'no'; end if;
  update public.jobs set live_seen_at = now(), live_first_at = coalesce(live_first_at, now())
   where live_code = p_code and status <> 'cancelled';
  return 'ok';
end $$;
grant execute on function public.live_ping(text) to anon, authenticated;

create or replace function public._cust_seen_json(r public.chat_rooms) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'first', j.live_first_at,
    'last',  j.live_seen_at,
    'views', coalesce(j.live_views, 0),
    'read',  coalesce((select last_id from public.chat_reads where room_id = r.id and who = 'cust'), 0),
    'now',   now())
  from public.jobs j where j.id = r.job_id
$$;
revoke all on function public._cust_seen_json(public.chat_rooms) from anon, authenticated;

-- 직원 화면용 (자기 방만)
create or replace function public.chat_cust_seen(p_token text, p_room bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); r public.chat_rooms;
begin
  select * into r from public.chat_rooms where id = p_room;
  if r.id is null or r.kind <> 'cust' or not public._chat_on(s) or not public._chat_can(s, r) then return null; end if;
  return public._cust_seen_json(r);
end $$;
grant execute on function public.chat_cust_seen(text, bigint) to anon, authenticated;

-- HQ·HQS 화면용
create or replace function public.chat_admin_cust_seen(p_room bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare r public.chat_rooms;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into r from public.chat_rooms where id = p_room;
  if r.id is null or r.kind <> 'cust' then return null; end if;
  if not public.is_owner() and not public._chat_mgr(r) then return null; end if;
  return public._cust_seen_json(r);
end $$;
grant execute on function public.chat_admin_cust_seen(bigint) to authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 26 $$;

select '업데이트 완료 (v26)' as result;
