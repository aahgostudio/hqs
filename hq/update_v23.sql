-- ============================================================
--  어닝플레이스 HQ 업데이트 v23 (2026-10-29)
--  고객방 이름·정리
--   · 방 이름: HQ = '10/30 이유나 고객님 방 · 현장', 직원 = '10/30 고객님 방 · 현장' (고객 이름은 직원에게 안 보임)
--   · 링크가 닫히면(작업 끝 + 7일) HQ에서도 '진행 중 현장'에서 빠지고 보관함으로 — 대화·사진은 그대로 보관
--   · 현장을 지워도 기록은 남김: 손님방·현장 사진은 지워지지 않고, 현장 정보는 보관표에 저장
-- ============================================================
create or replace function public._chat_title(r public.chat_rooms) returns text
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(r.title, case r.kind
    when 'all'  then '전체'
    when 'team' then public._chat_grp_title(r.grp)
    when 'dm'   then (select name from public.staff where id = r.staff_id)
    when 'cust' then (select to_char(j.job_date, 'MM/DD') || ' 고객님 방 · ' || coalesce(j.title, '현장') from public.jobs j where j.id = r.job_id)
    when 'site' then (select to_char(j.job_date, 'MM/DD') || ' ' || coalesce(j.title, '현장') from public.jobs j where j.id = r.job_id)
    else '대화방' end)
$$;

-- HQ(대표·관리자)에서 보는 방 이름: 고객방은 고객 이름까지
create or replace function public._chat_title_hq(r public.chat_rooms) returns text
language sql stable security definer set search_path = public, extensions as $$
  select case when r.kind = 'cust' and r.title is null then
    coalesce((select to_char(j.job_date, 'MM/DD') || ' ' || coalesce(nullif(trim(j.cust_name), '') || ' ', '') || '고객님 방 · ' || coalesce(j.title, '현장')
                from public.jobs j where j.id = r.job_id), '고객님 방')
  else public._chat_title(r) end
$$;

create or replace function public.chat_admin_home() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare st public.staff; own boolean := public.is_owner(); me text := public._chat_who();
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  for st in select * from public.staff where status <> 'left' and not hidden loop
    perform public._chat_ensure(st);
  end loop;
  return jsonb_build_object(
    'on', coalesce((select value #>> '{}' from public.settings where key = 'chat_on'), 'false') = 'true',
    'owner', own,
    'rooms', coalesce((select jsonb_agg(x order by (x->>'closed')::boolean, (x->>'kind_o')::int, x->>'last_at' desc nulls last) from (
      select jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'grp', r.grp, 'title', public._chat_title_hq(r), 'custom_title', r.title,
        'staff_id', r.staff_id, 'job_id', r.job_id, 'keep', r.keep, 'mgr', public._chat_mgr(r),
        'closed', r.closed_at is not null or (r.kind = 'cust' and not exists (select 1 from public.jobs j where j.id = r.job_id and public._live_open(j))),
        'job_date', (select job_date from public.jobs j where j.id = r.job_id), 'closed_at', r.closed_at, 'created_at', r.created_at,
        'live', r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j)),
        'left_at', case when r.kind = 'dm' then (select left_at from public.staff where id = r.staff_id) end,
        'kind_o', case r.kind when 'all' then 1 when 'team' then 2 when 'custom' then 3 when 'cust' then 0 when 'site' then 4 else 5 end,
        'last', (select jsonb_build_object('body', case when m.deleted_at is not null then '삭제된 메시지' when coalesce(m.body,'') = '' then '사진' else m.body end,
                         'name', public._chat_msg_json(m, null, false)->>'name', 'at', m.created_at)
                   from public.chat_messages m where m.room_id = r.id order by m.id desc limit 1),
        'last_at', (select max(created_at) from public.chat_messages m where m.room_id = r.id),
        'count', (select count(*) from public.chat_messages m where m.room_id = r.id),
        'unread', (select count(*) from public.chat_messages m where m.room_id = r.id
                     and (m.cust or not (m.staff_id is null and (m.admin_uid = auth.uid() or (m.admin_uid is null and own))))
                     and m.id > coalesce((select last_id from public.chat_reads where room_id = r.id and who = me), 0)),
        'members', (select coalesce(jsonb_agg(x2), '[]'::jsonb) from public._chat_members(r) x2)
      ) x
      from public.chat_rooms r
     where own or (public._chat_mgr(r) and r.closed_at is null
                   and (r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j))))) q), '[]'::jsonb));
end $$;
grant execute on function public.chat_admin_home() to authenticated;

create or replace function public.chat_admin_load(p_room bigint, p_after bigint default 0, p_before bigint default null, p_limit int default 80)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.chat_rooms; msgs jsonb; mx bigint; mn bigint; own boolean := public.is_owner();
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into r from public.chat_rooms where id = p_room;
  if r.id is null or (not own and (not public._chat_mgr(r) or r.closed_at is not null)) then raise exception 'no_room'; end if;
  select coalesce(jsonb_agg(public._chat_msg_json(m, null, own) order by m.id), '[]'::jsonb), max(m.id), min(m.id)
    into msgs, mx, mn
    from (select * from public.chat_messages
           where room_id = r.id and id > coalesce(p_after, 0) and (p_before is null or id < p_before)
           order by id desc limit greatest(1, least(p_limit, 5000))) m;
  if mx is not null then
    insert into public.chat_reads (room_id, who, last_id) values (r.id, public._chat_who(), mx)
      on conflict (room_id, who) do update set last_id = greatest(public.chat_reads.last_id, excluded.last_id), at = now();
  end if;
  return jsonb_build_object('room', jsonb_build_object('id', r.id, 'kind', r.kind, 'title', public._chat_title_hq(r), 'mgr', public._chat_mgr(r),
      'members', (select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'avatar', st.avatar_path, 'role', st.role) order by st.name)
                    from public.staff st where st.id in (select public._chat_members(r)))),
    'msgs', msgs,
    'unread', public._chat_unread_map(r, coalesce(mn, 0)));
end $$;
grant execute on function public.chat_admin_load(bigint, bigint, bigint, int) to authenticated;

-- 현장을 지워도 자료는 남김
create table if not exists private.job_archive (
  job_id     bigint not null,
  job        jsonb  not null,
  deleted_at timestamptz not null default now()
);
revoke all on private.job_archive from public, anon, authenticated;

alter table public.job_photos alter column job_id drop not null;
do $$ declare c text; begin
  for c in select conname from pg_constraint where conrelid = 'public.job_photos'::regclass and contype = 'f' and confrelid = 'public.jobs'::regclass loop
    execute format('alter table public.job_photos drop constraint %I', c);
  end loop;
end $$;
alter table public.job_photos add constraint job_photos_job_id_fkey foreign key (job_id) references public.jobs(id) on delete set null;
alter table public.job_photos add column if not exists job_title text;   -- 현장이 지워졌을 때 어디 사진인지

create or replace function private.on_job_delete() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
begin
  insert into private.job_archive (job_id, job) values (old.id, to_jsonb(old));
  update public.job_photos set job_title = to_char(old.job_date, 'YYYY-MM-DD') || ' ' || coalesce(old.title, '') where job_id = old.id;
  -- 방 이름을 고정해 둠 (현장이 없어져도 HQ 보관함에서 어떤 방인지 알 수 있게) + 닫기
  update public.chat_rooms r set title = coalesce(r.title, public._chat_title_hq(r)) || ' (현장 삭제됨)', closed_at = coalesce(r.closed_at, now())
   where r.job_id = old.id and r.kind in ('cust', 'site');
  return old;
end $$;
drop trigger if exists job_delete_keep on public.jobs;
create trigger job_delete_keep before delete on public.jobs for each row execute function private.on_job_delete();

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 23 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v23)' as result;
