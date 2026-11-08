-- 대표님이 직원·고객 메시지도 삭제 (원문은 이력에 남음) (2026-11-08)
create or replace function public.chat_owner_del(p_id bigint)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare m public.chat_messages;
begin
  if not public.is_owner() then raise exception 'not_owner'; end if;
  select * into m from public.chat_messages where id = p_id;
  if m.id is null or m.deleted_at is not null then raise exception 'no_msg'; end if;
  update public.chat_messages
     set history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('body', m.body, 'photo', m.photo, 'at', now(), 'act', 'delete', 'by', 'owner')),
         deleted_at = now()
   where id = p_id;
  return 'ok';
end $$;
grant execute on function public.chat_owner_del(bigint) to authenticated;
notify pgrst, 'reload schema';
select '업데이트 완료 · 대표님 메시지 삭제' as result;
