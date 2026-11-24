-- 속도 1단계 (2026-11-24): '방 보고 있음' 신호를 4초 → 15초마다로 줄임 → 서버 기준도 12초 → 40초로
create or replace function private.here(p_room bigint, p_who text) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from private.chat_here where room_id = p_room and who = p_who and at > now() - interval '40 seconds')
$$;
select '업데이트 완료 · 속도 1단계' as result;
