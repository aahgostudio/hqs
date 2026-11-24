-- 방 인원 넣고 빼기 (2026-11-24) · 초대 + 빼기 + 도급팀 묶기 한 번에
--  · chat_members = 초대한 사람 (원래 멤버에 더함)
--  · chat_out     = 뺀 사람 (원래 멤버인데 이 방에서만 뺌)
--  · 도급팀(crew_lead) 묶기 그대로 유지
alter table public.staff add column if not exists crew_lead uuid references public.staff(id) on delete set null;

create table if not exists public.chat_out (
  room_id  bigint not null references public.chat_rooms(id) on delete cascade,
  staff_id uuid   not null references public.staff(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, staff_id)
);
alter table public.chat_out enable row level security;
drop policy if exists "owner_all" on public.chat_out;
create policy "owner_all" on public.chat_out for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- 원래 멤버 (팀·전체·현장·고객님 방 규칙)
create or replace function public._chat_base(r public.chat_rooms) returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select s.id from public.staff s
   where s.status <> 'left' and not s.hidden
     and (case r.kind
           when 'all'    then public._chat_in_all(s.team)
           when 'team'   then public._chat_grp(s.team) = r.grp
           when 'dm'     then s.id = r.staff_id
           when 'site'   then exists (select 1 from public.assignments a join public.staff x on x.id = a.staff_id
                                       where a.job_id = r.job_id and a.status = 'approved'
                                         and (a.staff_id = s.id or coalesce(x.crew_lead, x.id) = coalesce(s.crew_lead, s.id)))
           when 'cust'   then exists (select 1 from public.assignments a join public.staff x on x.id = a.staff_id
                                       where a.job_id = r.job_id and a.status = 'approved'
                                         and (a.staff_id = s.id or coalesce(x.crew_lead, x.id) = coalesce(s.crew_lead, s.id)))
           when 'custom' then exists (select 1 from public.chat_members m where m.room_id = r.id and m.staff_id = s.id)
           else false end)
$$;

-- 실제 멤버 = (원래 멤버 − 뺀 사람) + 초대한 사람
create or replace function public._chat_members(r public.chat_rooms) returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select s.id from public.staff s
   where s.status <> 'left' and not s.hidden
     and ((s.id in (select public._chat_base(r))
           and not exists (select 1 from public.chat_out o where o.room_id = r.id and o.staff_id = s.id))
          or (r.kind <> 'dm' and exists (select 1 from public.chat_members m where m.room_id = r.id and m.staff_id = s.id)))
$$;

-- 대표님 화면: 이 방 원래 멤버 / 초대 / 뺀 사람
create or replace function public.chat_admin_people(p_id bigint) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare r public.chat_rooms;
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  select * into r from public.chat_rooms where id = p_id;
  return jsonb_build_object(
    'base',   coalesce((select jsonb_agg(x) from public._chat_base(r) x), '[]'::jsonb),
    'guests', coalesce((select jsonb_agg(staff_id) from public.chat_members where room_id = p_id), '[]'::jsonb),
    'outs',   coalesce((select jsonb_agg(staff_id) from public.chat_out where room_id = p_id), '[]'::jsonb));
end $$;

-- 저장: p_in = 이 방에 있어야 할 사람 전부
create or replace function public.chat_admin_people_set(p_id bigint, p_in uuid[]) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r public.chat_rooms; b uuid[];
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  select * into r from public.chat_rooms where id = p_id;
  if r.kind in ('dm', 'custom') then raise exception 'not_allowed'; end if;
  p_in := coalesce(p_in, '{}');
  select coalesce(array_agg(x), '{}') into b from public._chat_base(r) x;
  delete from public.chat_members where room_id = p_id;
  insert into public.chat_members (room_id, staff_id) select p_id, x from unnest(p_in) x where not (x = any(b)) on conflict do nothing;
  delete from public.chat_out where room_id = p_id;
  insert into public.chat_out (room_id, staff_id) select p_id, x from unnest(b) x where not (x = any(p_in)) on conflict do nothing;
  return 'ok';
end $$;

revoke all on function public._chat_base(public.chat_rooms) from public, anon, authenticated;
grant execute on function public.chat_admin_people(bigint), public.chat_admin_people_set(bigint, uuid[]) to authenticated;
notify pgrst, 'reload schema';
select '업데이트 완료 · 방 인원 넣고 빼기 (도급팀 묶기 유지)' as result;
