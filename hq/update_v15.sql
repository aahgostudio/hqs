-- ============================================================
--  어닝플레이스 HQ 업데이트 v15 (2026-10-28)
--  대화 속 계좌·통장 사진 → 인사카드 대표 전용 칸으로 옮기고, 대화에서는 완전히 지우기 (대표만)
--  (보통 삭제는 원문을 남기지만, 개인정보는 원문·사진까지 지움)
-- ============================================================
drop policy if exists "chat_owner_delete" on storage.objects;
create policy "chat_owner_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat' and public.is_owner());

create or replace function public.chat_admin_purge_msg(p_id bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare m public.chat_messages; paths jsonb;
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  select * into m from public.chat_messages where id = p_id;
  if m.id is null then raise exception 'not_found'; end if;
  select coalesce(jsonb_agg(distinct x.p), '[]'::jsonb) into paths
    from (select m.photo as p union all select h->>'photo' from jsonb_array_elements(m.history) h) x
   where x.p is not null and x.p <> '';
  delete from public.chat_messages where id = p_id;
  return paths;   -- 화면에서 이 사진 파일들을 저장소에서 지움
end $$;
revoke all on function public.chat_admin_purge_msg(bigint) from anon;
grant execute on function public.chat_admin_purge_msg(bigint) to authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 15 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v15)' as result;
