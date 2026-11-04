-- ============================================================
--  어닝플레이스 HQ 업데이트 v37 (2026-11-04)
--  대화: 안 읽은 숫자 누르면 누가 읽었는지 · 안 읽었는지 (대표님만)
-- ============================================================
create or replace function public.chat_admin_readers(p_msg bigint) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare m public.chat_messages; r public.chat_rooms;
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  select * into m from public.chat_messages where id = p_msg;
  if not found then return '{}'::jsonb; end if;
  select * into r from public.chat_rooms where id = m.room_id;
  return (
    with mem as (
      select x::text as who, s.name from public._chat_members(r) x join public.staff s on s.id = x
      union all select 'boss', '대표'
    ), rd as (
      select mem.who, mem.name, coalesce(cr.last_id, 0) >= m.id as read
        from mem left join public.chat_reads cr on cr.room_id = r.id and cr.who = mem.who
       where mem.who <> coalesce(m.staff_id::text, 'boss')
    )
    select jsonb_build_object(
      'read',   coalesce((select jsonb_agg(name order by name) from rd where read), '[]'::jsonb),
      'unread', coalesce((select jsonb_agg(name order by name) from rd where not read), '[]'::jsonb))
  );
end $$;
grant execute on function public.chat_admin_readers(bigint) to authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(37, 0) $$;

select '업데이트 완료 (v37) · 대화 읽음 확인' as result;
