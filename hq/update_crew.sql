-- 도급 파트너 한 팀으로 묶기 (2026-11-20)
--  · staff.crew_lead = 팀장 id → 팀장(또는 팀원)이 현장에 확정되면 같은 팀 사람도 그 현장 대화방·고객님 방에 같이 들어감 (사진 올리기)
--  · 임상욱팀(임상욱·김유정·윤영무) 묶고, 셋만 있는 '임상욱팀' 대화방도 만듦
alter table public.staff add column if not exists crew_lead uuid references public.staff(id) on delete set null;

create or replace function public._chat_members(r public.chat_rooms) returns setof uuid
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
           else false end
          or (r.kind <> 'dm' and exists (select 1 from public.chat_members m where m.room_id = r.id and m.staff_id = s.id)))
$$;

-- 임상욱팀 묶기
update public.staff set crew_lead = (select id from public.staff where name = '임상욱' and status <> 'left' limit 1)
 where name in ('김유정', '윤영무') and team = 'PRT' and status <> 'left';

-- 임상욱팀 대화방 (없을 때만)
do $$
declare rid bigint;
begin
  select id into rid from public.chat_rooms where kind = 'custom' and title = '임상욱팀' and closed_at is null limit 1;
  if rid is null then insert into public.chat_rooms (kind, title) values ('custom', '임상욱팀') returning id into rid; end if;
  insert into public.chat_members (room_id, staff_id)
  select rid, id from public.staff where name in ('임상욱', '김유정', '윤영무') and status <> 'left' on conflict do nothing;
end $$;

notify pgrst, 'reload schema';
select string_agg(s.name || coalesce(' → ' || l.name || '팀', ' (팀장)'), ', ') as result
  from public.staff s left join public.staff l on l.id = s.crew_lead
 where s.name in ('임상욱', '김유정', '윤영무') and s.status <> 'left';
