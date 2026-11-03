-- ============================================================
--  어닝플레이스 HQ 업데이트 v31 (2026-11-03)
--  대화방 답장(댓글)
--   · 직원: 말풍선 길게 누르기 → [↩️ 답장]
--   · HQ: 말풍선 시간 옆 [↩]
--   · 답장 글 위에 원문 한 줄이 붙고, 누르면 원문으로 이동
-- ============================================================
alter table public.chat_messages add column if not exists reply_to bigint references public.chat_messages(id) on delete set null;

create or replace function public._chat_msg_json(m public.chat_messages, p_me uuid, p_admin boolean) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', m.id,
    'who', case when m.cust then 'cust' else coalesce(m.staff_id::text, case when m.admin_uid is null or exists (select 1 from public.admins a where a.user_id = m.admin_uid and a.role = 'owner') then 'boss' else 'mgr:' || m.admin_uid::text end) end,
    'name', case when m.cust then '고객님' else coalesce((select name from public.staff where id = m.staff_id),
                     case when m.admin_uid is null or exists (select 1 from public.admins a where a.user_id = m.admin_uid and a.role = 'owner') then '대표'
                          else '관리자 ' || coalesce((select name from public.admins a where a.user_id = m.admin_uid), '') end) end,
    'avatar', (select avatar_path from public.staff where id = m.staff_id),
    'mine', case when m.cust then false when p_me is null then (m.staff_id is null and (m.admin_uid = auth.uid() or (m.admin_uid is null and public.is_owner()))) else m.staff_id = p_me end,
    'body', case when m.deleted_at is null or p_admin then m.body end,
    'photo', case when m.deleted_at is null or p_admin then m.photo end,
    'at', m.created_at,
    'edited', m.edited_at is not null,
    'deleted', m.deleted_at is not null,
    'history', case when p_admin then m.history end,
    -- v31: 답장(댓글) 원문
    'reply', (select jsonb_build_object('id', o.id,
                'name', case when o.cust then '고객님' else coalesce((select name from public.staff where id = o.staff_id),
                          case when o.admin_uid is null or exists (select 1 from public.admins a where a.user_id = o.admin_uid and a.role = 'owner') then '대표'
                               else '관리자 ' || coalesce((select name from public.admins a where a.user_id = o.admin_uid), '') end) end,
                'body', case when o.deleted_at is null then left(o.body, 120) end,
                'photo', case when o.deleted_at is null then o.photo end,
                'deleted', o.deleted_at is not null)
              from public.chat_messages o where o.id = m.reply_to))
$$;

-- 직원: 답장 보내기 (보내기는 기존 chat_send 그대로 쓰고 원문만 연결)
create or replace function public.chat_send_reply(p_token text, p_room bigint, p_body text, p_reply bigint)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare nid bigint;
begin
  nid := public.chat_send(p_token, p_room, p_body, null);
  update public.chat_messages set reply_to = p_reply
   where id = nid and exists (select 1 from public.chat_messages o where o.id = p_reply and o.room_id = p_room);
  return nid;
end $$;
grant execute on function public.chat_send_reply(text, bigint, text, bigint) to anon, authenticated;

-- 대표·관리자: 답장 보내기
create or replace function public.chat_admin_send_reply(p_room bigint, p_body text, p_reply bigint)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare nid bigint;
begin
  nid := public.chat_admin_send(p_room, p_body, null);
  update public.chat_messages set reply_to = p_reply
   where id = nid and exists (select 1 from public.chat_messages o where o.id = p_reply and o.room_id = p_room);
  return nid;
end $$;
grant execute on function public.chat_admin_send_reply(bigint, text, bigint) to authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(31, 0) $$;

select '업데이트 완료 (v31) · 대화 답장(댓글)' as result;
