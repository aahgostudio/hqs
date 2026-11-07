-- ============================================================
--  어닝플레이스 HQ 업데이트 v46 (2026-11-07)
--  📥 매물 등록함 — 대표님만 보는 방에 매물 사진·캡처를 올리면 클로가 읽어서 매물노트에 정리
--  · 방: '📥 매물 등록함' (대표 전용, 직원 0명, 보관 고정)
--  · 클로 전용 열쇠(해시만 저장)로 이 방 하나만 읽고 쓸 수 있음 — 다른 방·직원 정보는 못 봄
--  · 클로 답장은 '🤖 클로 · ' 로 시작
--  · 맨 아래: 저장 공간 점검 결과(대화 속도 확인용)
-- ============================================================

-- 1) 방 만들기 (이미 있으면 그대로)
do $$ declare rid bigint; begin
  select (value->>'room')::bigint into rid from public.settings where key = 'maemul_inbox';
  if rid is null or not exists (select 1 from public.chat_rooms where id = rid) then
    insert into public.chat_rooms (kind, title, keep) values ('custom', '📥 매물 등록함', true) returning id into rid;
  end if;
  insert into public.settings (key, value)
  values ('maemul_inbox', jsonb_build_object('room', rid, 'key', 'c019fc343821e0afefb52d2ef9bf3e73c5b7358f76060a7a2e30ab6b595345dd'))
  on conflict (key) do update set value = jsonb_build_object('room', rid, 'key', 'c019fc343821e0afefb52d2ef9bf3e73c5b7358f76060a7a2e30ab6b595345dd');
end $$;

-- 2) 열쇠 확인 (sha256)
create or replace function public._inbox_room(p_key text) returns bigint
language plpgsql stable security definer set search_path = public, extensions as $$
declare v jsonb;
begin
  select value into v from public.settings where key = 'maemul_inbox';
  if v is null or p_key is null or encode(extensions.digest(p_key, 'sha256'), 'hex') <> v->>'key' then
    raise exception 'invalid_key' using errcode = '28000'; end if;
  return (v->>'room')::bigint;
end $$;
revoke all on function public._inbox_room(text) from public, anon, authenticated;

-- 3) 클로가 읽기: p_after 다음 글부터 (사진은 공개 경로)
create or replace function public.inbox_load(p_key text, p_after bigint default 0)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare rid bigint := public._inbox_room(p_key);
begin
  return jsonb_build_object('room', rid, 'msgs', coalesce((
    select jsonb_agg(jsonb_build_object('id', m.id, 'at', m.created_at, 'body', m.body, 'photo', m.photo,
             'bot', coalesce(m.body, '') like '🤖 클로 · %') order by m.id)
      from public.chat_messages m
     where m.room_id = rid and m.id > coalesce(p_after, 0) and m.deleted_at is null), '[]'::jsonb));
end $$;
grant execute on function public.inbox_load(text, bigint) to anon, authenticated;

-- 4) 클로가 답장
create or replace function public.inbox_send(p_key text, p_body text)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare rid bigint := public._inbox_room(p_key); nid bigint;
begin
  if coalesce(trim(p_body), '') = '' then raise exception 'empty'; end if;
  insert into public.chat_messages (room_id, staff_id, body) values (rid, null, left('🤖 클로 · ' || p_body, 4000)) returning id into nid;
  return nid;
end $$;
grant execute on function public.inbox_send(text, text) to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(46, 0) $$;

-- 5) 저장 공간 점검 (대화가 느린 원인 확인용) — 결과 화면을 캡처해서 클로에게 보내주세요
select '업데이트 완료 (v46) · 매물 등록함' as result,
       (select pg_size_pretty(pg_database_size(current_database()))) as db_size,
       (select pg_size_pretty(coalesce(sum((metadata->>'size')::bigint),0)) from storage.objects) as storage_all,
       (select pg_size_pretty(coalesce(sum((metadata->>'size')::bigint),0)) from storage.objects where bucket_id = 'chat') as storage_chat,
       (select count(*) from storage.objects where bucket_id = 'chat') as chat_files,
       (select count(*) from public.chat_messages) as chat_msgs;
