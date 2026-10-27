-- ============================================================
--  어닝플레이스 HQ 업데이트 v6 (2026-10-27)
--  대화: 관리자(HQS)도 참여
--   · 관리자는 '관리자 참여' 방만 보고 대화 (기본: 전체 · 청소팀 · 도급 파트너 · 현장방)
--   · 방 개설 · 이름 · 인원 · 닫기 · 정리 · 직원에게 열기 = 대표만
--   · 대화 표는 대표만 직접 열람 (관리자는 참여 방만 함수로)
--  Supabase → SQL Editor → 붙여넣고 Run → '업데이트 완료 (v6)'
-- ============================================================

alter table public.chat_rooms add column if not exists mgr boolean;   -- null = 기본값 따름

-- 대화 표: 대표만 직접 접근 (함수로는 관리자도 자기 방만)
do $$ declare t text; begin
  foreach t in array array['chat_rooms','chat_members','chat_messages','chat_reads'] loop
    execute format('drop policy if exists "admin_all" on public.%I', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
  end loop;
end $$;

-- 관리자 참여 여부 (기본: 전체 · 청소팀 · 도급 파트너 · 현장방)
create or replace function public._chat_mgr(r public.chat_rooms) returns boolean language sql stable as $$
  select coalesce(r.mgr, r.kind in ('all','site') or (r.kind = 'team' and r.grp in ('clean','prt')))
$$;

create or replace function public._chat_who() returns text language sql stable security definer set search_path = public, extensions as $$
  select case when public.is_owner() then 'boss' else 'mgr:' || auth.uid()::text end
$$;

create or replace function public._chat_msg_json(m public.chat_messages, p_me uuid, p_admin boolean) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', m.id,
    'who', coalesce(m.staff_id::text, case when m.admin_uid is null or exists (select 1 from public.admins a where a.user_id = m.admin_uid and a.role = 'owner') then 'boss' else 'mgr:' || m.admin_uid::text end),
    'name', coalesce((select name from public.staff where id = m.staff_id),
                     case when m.admin_uid is null or exists (select 1 from public.admins a where a.user_id = m.admin_uid and a.role = 'owner') then '대표'
                          else '관리자 ' || coalesce((select name from public.admins a where a.user_id = m.admin_uid), '') end),
    'avatar', (select avatar_path from public.staff where id = m.staff_id),
    'mine', case when p_me is null then (m.staff_id is null and (m.admin_uid = auth.uid() or (m.admin_uid is null and public.is_owner()))) else m.staff_id = p_me end,
    'body', case when m.deleted_at is null or p_admin then m.body end,
    'photo', case when m.deleted_at is null or p_admin then m.photo end,
    'at', m.created_at,
    'edited', m.edited_at is not null,
    'deleted', m.deleted_at is not null,
    'history', case when p_admin then m.history end)
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
        'id', r.id, 'kind', r.kind, 'grp', r.grp, 'title', public._chat_title(r), 'custom_title', r.title,
        'staff_id', r.staff_id, 'job_id', r.job_id, 'keep', r.keep, 'mgr', public._chat_mgr(r),
        'closed', r.closed_at is not null, 'closed_at', r.closed_at, 'created_at', r.created_at,
        'live', r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j)),
        'left_at', case when r.kind = 'dm' then (select left_at from public.staff where id = r.staff_id) end,
        'kind_o', case r.kind when 'all' then 1 when 'team' then 2 when 'custom' then 3 when 'site' then 4 else 5 end,
        'last', (select jsonb_build_object('body', case when m.deleted_at is not null then '삭제된 메시지' when coalesce(m.body,'') = '' then '사진' else m.body end,
                         'name', public._chat_msg_json(m, null, false)->>'name', 'at', m.created_at)
                   from public.chat_messages m where m.room_id = r.id order by m.id desc limit 1),
        'last_at', (select max(created_at) from public.chat_messages m where m.room_id = r.id),
        'count', (select count(*) from public.chat_messages m where m.room_id = r.id),
        'unread', (select count(*) from public.chat_messages m where m.room_id = r.id
                     and not (m.staff_id is null and (m.admin_uid = auth.uid() or (m.admin_uid is null and own)))
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
  return jsonb_build_object('room', jsonb_build_object('id', r.id, 'kind', r.kind, 'title', public._chat_title(r), 'mgr', public._chat_mgr(r),
      'members', (select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'avatar', st.avatar_path, 'role', st.role) order by st.name)
                    from public.staff st where st.id in (select public._chat_members(r)))),
    'msgs', msgs,
    'unread', public._chat_unread_map(r, coalesce(mn, 0)));
end $$;
grant execute on function public.chat_admin_load(bigint, bigint, bigint, int) to authenticated;

create or replace function public.chat_admin_send(p_room bigint, p_body text, p_photo text default null)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare nid bigint; r public.chat_rooms;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into r from public.chat_rooms where id = p_room;
  if r.id is null or r.closed_at is not null or (not public.is_owner() and not public._chat_mgr(r)) then raise exception 'no_room'; end if;
  if coalesce(trim(p_body), '') = '' and p_photo is null then raise exception 'empty'; end if;
  insert into public.chat_messages (room_id, staff_id, admin_uid, body, photo)
    values (p_room, null, auth.uid(), left(p_body, 4000), p_photo) returning id into nid;
  insert into public.chat_reads (room_id, who, last_id) values (p_room, public._chat_who(), nid)
    on conflict (room_id, who) do update set last_id = excluded.last_id, at = now();
  return nid;
end $$;
grant execute on function public.chat_admin_send(bigint, text, text) to authenticated;

-- 방 관리 = 대표만
create or replace function public.chat_admin_room_save(p_id bigint, p_title text, p_members uuid[])
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare rid bigint := p_id;
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  if rid is null then
    insert into public.chat_rooms (kind, title) values ('custom', nullif(trim(p_title), '')) returning id into rid;
  else
    update public.chat_rooms set title = nullif(trim(p_title), '') where id = rid;
  end if;
  if (select kind from public.chat_rooms where id = rid) = 'custom' and p_members is not null then
    delete from public.chat_members where room_id = rid and not (staff_id = any(p_members));
    insert into public.chat_members (room_id, staff_id) select rid, unnest(p_members) on conflict do nothing;
  end if;
  return rid;
end $$;

create or replace function public.chat_admin_room_flag(p_id bigint, p_closed boolean default null, p_keep boolean default null, p_mgr boolean default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  update public.chat_rooms
     set closed_at = case when p_closed is null then closed_at when p_closed then coalesce(closed_at, now()) else null end,
         keep = coalesce(p_keep, keep),
         mgr = coalesce(p_mgr, mgr)
   where id = p_id;
  return 'ok';
end $$;
drop function if exists public.chat_admin_room_flag(bigint, boolean, boolean);
grant execute on function public.chat_admin_room_flag(bigint, boolean, boolean, boolean) to authenticated;

create or replace function public.chat_admin_set(p_on boolean default null, p_beta uuid[] default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  if p_on is not null then
    insert into public.settings (key, value) values ('chat_on', to_jsonb(p_on)) on conflict (key) do update set value = excluded.value;
  end if;
  if p_beta is not null then
    insert into public.settings (key, value) values ('chat_beta', to_jsonb(p_beta::text[])) on conflict (key) do update set value = excluded.value;
  end if;
  return 'ok';
end $$;

create or replace function public.chat_admin_purge(p_id bigint) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r public.chat_rooms;
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  select * into r from public.chat_rooms where id = p_id;
  if r.kind <> 'dm' or r.keep or not exists (select 1 from public.staff where id = r.staff_id and status = 'left') then raise exception 'not_allowed'; end if;
  delete from public.chat_rooms where id = p_id;
  return 'ok';
end $$;

-- 직원 화면: 관리자 참여 방이면 인원에 '관리자'도 표시
create or replace function public.chat_home(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  if not public._chat_on(s) then return jsonb_build_object('on', false); end if;
  perform public._chat_ensure(s);
  return jsonb_build_object('on', true, 'me', jsonb_build_object('id', s.id, 'name', s.name),
    'rooms', coalesce((select jsonb_agg(x order by (x->>'kind_o')::int, x->>'last_at' desc nulls last) from (
      select jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'title', case when r.kind = 'dm' then '대표님' else public._chat_title(r) end,
        'kind_o', case r.kind when 'dm' then 1 when 'all' then 2 when 'team' then 3 when 'site' then 4 else 5 end,
        'last', (select jsonb_build_object('body', case when m.deleted_at is not null then '삭제된 메시지' when m.body is null or m.body = '' then '사진' else m.body end,
                         'name', public._chat_msg_json(m, s.id, false)->>'name', 'at', m.created_at)
                   from public.chat_messages m where m.room_id = r.id order by m.id desc limit 1),
        'last_at', (select max(created_at) from public.chat_messages m where m.room_id = r.id),
        'unread', (select count(*) from public.chat_messages m where m.room_id = r.id
                     and m.id > coalesce((select last_id from public.chat_reads where room_id = r.id and who = s.id::text), 0)
                     and (m.staff_id is distinct from s.id)),
        'n', (select count(*) from public._chat_members(r)) + 1,
        'mgr', public._chat_mgr(r)
      ) x
      from public.chat_rooms r where public._chat_can(s, r)) q), '[]'::jsonb));
end $$;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 6 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v6)' as result;
