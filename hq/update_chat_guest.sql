-- 팀·전체·현장 방에 사람 초대 (2026-11-20)
--  · 원래 멤버(팀 등)는 그대로, chat_members에 넣은 사람이 더해짐
create or replace function public._chat_members(r public.chat_rooms) returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select s.id from public.staff s
   where s.status <> 'left' and not s.hidden
     and (case r.kind
           when 'all'    then public._chat_in_all(s.team)
           when 'team'   then public._chat_grp(s.team) = r.grp
           when 'dm'     then s.id = r.staff_id
           when 'site'   then exists (select 1 from public.assignments a where a.job_id = r.job_id and a.staff_id = s.id and a.status = 'approved')
           when 'cust'   then exists (select 1 from public.assignments a where a.job_id = r.job_id and a.staff_id = s.id and a.status = 'approved')
           when 'custom' then exists (select 1 from public.chat_members m where m.room_id = r.id and m.staff_id = s.id)
           else false end
          or (r.kind <> 'dm' and exists (select 1 from public.chat_members m where m.room_id = r.id and m.staff_id = s.id)))
$$;

create or replace function public.chat_admin_guests(p_id bigint) returns uuid[]
language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  return coalesce((select array_agg(staff_id) from public.chat_members where room_id = p_id), '{}');
end $$;

create or replace function public.chat_admin_guests_set(p_id bigint, p_members uuid[]) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  if (select kind from public.chat_rooms where id = p_id) in ('dm', 'custom') then raise exception 'not_allowed'; end if;
  delete from public.chat_members where room_id = p_id and not (staff_id = any(coalesce(p_members, '{}')));
  insert into public.chat_members (room_id, staff_id) select p_id, unnest(coalesce(p_members, '{}')) on conflict do nothing;
  return 'ok';
end $$;
grant execute on function public.chat_admin_guests(bigint), public.chat_admin_guests_set(bigint, uuid[]) to authenticated;
notify pgrst, 'reload schema';
select '업데이트 완료 · 방 초대' as result;
