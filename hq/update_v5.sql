-- ============================================================
--  어닝플레이스 HQ 업데이트 v5 (2026-10-27)
--  팀 대화 (카카오워크 졸업)
--   · 방: 전체 / 팀 / 현장 / 대표 1:1 / 대표가 만든 방
--   · 직원은 자기 방만 보임 · 방 개설·인원·닫기는 대표(HQ)만
--   · 증거 보관: 수정·삭제해도 원문과 이력이 남음, 시간은 서버 시간, 방은 삭제 대신 '닫기(보관)'
--   · 현장방: 작업 완료 보고 후 7일 뒤 직원 목록에서 빠짐 (기록은 HQ에 그대로)
--   · 처음엔 꺼진 상태 → HQ 대화 탭에서 '직원에게 열기'
--  Supabase → SQL Editor → 붙여넣고 Run → '업데이트 완료 (v5)'
-- ============================================================

-- (v4 포함: 대표 현장 표시 — 이미 돌렸어도 다시 돌려도 괜찮아요)
alter table public.jobs add column if not exists boss_on boolean not null default false;
update public.jobs set boss_on = true where public_note like '대표 현장%' or admin_memo like '대표 현장%';

-- 오늘 대표님이 가는 현장 시간만 (주소·손님 정보 없음)
create or replace function public.boss_jobs_today() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(jsonb_agg(jsonb_build_object('t', to_char(start_time, 'HH24:MI'), 'k', kind) order by start_time), '[]'::jsonb)
    from public.jobs
   where boss_on and job_date = (now() at time zone 'Asia/Seoul')::date
     and status not in ('cancelled', 'quote') and start_time is not null
$$;
grant execute on function public.boss_jobs_today() to anon, authenticated;


-- 퇴사일 기록 (퇴사 후 1년 → HQ에서 '장기 보관 / 정리' 물어봄, 자동 삭제 없음)
alter table public.staff add column if not exists left_at timestamptz;
update public.staff set left_at = coalesce(left_at, now()) where status = 'left';
create or replace function public.staff_left_at() returns trigger language plpgsql as $$
begin
  if new.status = 'left' and (old.status is distinct from 'left') then new.left_at := coalesce(new.left_at, now()); end if;
  if new.status <> 'left' then new.left_at := null; end if;
  return new;
end $$;
drop trigger if exists staff_left_at on public.staff;
create trigger staff_left_at before update on public.staff for each row execute function public.staff_left_at();

create table if not exists public.chat_rooms (
  id         bigserial primary key,
  kind       text not null check (kind in ('all','team','site','dm','custom')),
  grp        text,                                   -- team 방: clean · res · prt · ago
  job_id     bigint references public.jobs(id) on delete set null,
  staff_id   uuid references public.staff(id) on delete cascade,   -- dm 방 상대
  title      text,
  closed_at  timestamptz,                            -- 닫힘(보관) — 직원 목록에서 사라짐
  keep       boolean not null default false,         -- 보관 고정 (기간 지나도 정리 안 함)
  created_at timestamptz not null default now()
);
create unique index if not exists chat_rooms_all  on public.chat_rooms (kind) where kind = 'all';
create unique index if not exists chat_rooms_team on public.chat_rooms (grp) where kind = 'team';
create unique index if not exists chat_rooms_site on public.chat_rooms (job_id) where kind = 'site';
create unique index if not exists chat_rooms_dm   on public.chat_rooms (staff_id) where kind = 'dm';

create table if not exists public.chat_members (       -- 대표가 만든 방 인원
  room_id  bigint not null references public.chat_rooms(id) on delete cascade,
  staff_id uuid   not null references public.staff(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (room_id, staff_id)
);

create table if not exists public.chat_messages (
  id         bigserial primary key,
  room_id    bigint not null references public.chat_rooms(id) on delete cascade,
  staff_id   uuid references public.staff(id) on delete set null,   -- null = 대표
  admin_uid  uuid,                                   -- HQ에서 보낸 계정
  body       text,
  photo      text,                                   -- chat 저장소 경로 (원본)
  created_at timestamptz not null default now(),     -- 서버 시간
  edited_at  timestamptz,
  deleted_at timestamptz,
  history    jsonb not null default '[]'::jsonb      -- 수정·삭제 전 원문
);
create index if not exists chat_messages_room on public.chat_messages (room_id, id);

create table if not exists public.chat_reads (
  room_id bigint not null references public.chat_rooms(id) on delete cascade,
  who     text   not null,                           -- staff uuid 또는 'boss'
  last_id bigint not null default 0,
  at      timestamptz not null default now(),
  primary key (room_id, who)
);

do $$ declare t text; begin
  foreach t in array array['chat_rooms','chat_members','chat_messages','chat_reads'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin_all" on public.%I', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
grant usage, select on all sequences in schema public to authenticated;

insert into public.settings (key, value) values ('chat_on', 'false'::jsonb) on conflict (key) do nothing;
insert into public.settings (key, value) values ('chat_beta', '[]'::jsonb) on conflict (key) do nothing;

-- 사진 저장소 (원본 보관, 추측 불가 경로, 15MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', true, 15728640, array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;
drop policy if exists "chat_upload" on storage.objects;
create policy "chat_upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'chat' and (public.avatar_upload_ok((storage.foldername(name))[1]) or public.is_admin()));

-- ------------------------------------------------------------
--  도우미
-- ------------------------------------------------------------
create or replace function public._chat_grp(p_team text) returns text language sql immutable as $$
  select case when p_team in ('OPS','SPT') then 'clean' when p_team = 'RES' then 'res'
              when p_team = 'PRT' then 'prt' when p_team = 'AGO' then 'ago' end
$$;
create or replace function public._chat_grp_title(p_grp text) returns text language sql immutable as $$
  select case p_grp when 'clean' then '청소팀' when 'res' then '부동산팀'
                    when 'prt' then '도급 파트너' when 'ago' then '아고스튜디오' else p_grp end
$$;
-- 전체방 = 어닝플레이스 직원 (직영·지원·부동산)
create or replace function public._chat_in_all(p_team text) returns boolean language sql immutable as $$
  select p_team in ('OPS','SPT','RES')
$$;

-- 현장방이 직원에게 보이는 기간: 하루 전 ~ 작업 완료 보고 후 7일 (보고 없으면 작업일 후 3일)
create or replace function public._chat_site_live(j public.jobs) returns boolean language sql stable as $$
  select j.status <> 'cancelled'
     and j.job_date <= public._today() + 1
     and case when coalesce(j.work_done_at, j.done_at) is not null
              then coalesce(j.work_done_at, j.done_at) > now() - interval '7 days'
              else j.job_date >= public._today() - 3 end
$$;

-- 방 인원 (현재 기준)
create or replace function public._chat_members(r public.chat_rooms) returns setof uuid
language sql stable security definer set search_path = public, extensions as $$
  select s.id from public.staff s
   where s.status <> 'left' and not s.hidden
     and case r.kind
           when 'all'    then public._chat_in_all(s.team)
           when 'team'   then public._chat_grp(s.team) = r.grp
           when 'dm'     then s.id = r.staff_id
           when 'site'   then exists (select 1 from public.assignments a where a.job_id = r.job_id and a.staff_id = s.id and a.status = 'approved')
           when 'custom' then exists (select 1 from public.chat_members m where m.room_id = r.id and m.staff_id = s.id)
           else false end
$$;

create or replace function public._chat_can(s public.staff, r public.chat_rooms) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select r.closed_at is null
     and s.id in (select public._chat_members(r))
     and (r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j)))
$$;

create or replace function public._chat_title(r public.chat_rooms) returns text
language sql stable security definer set search_path = public, extensions as $$
  select coalesce(r.title, case r.kind
    when 'all'  then '전체'
    when 'team' then public._chat_grp_title(r.grp)
    when 'dm'   then (select name from public.staff where id = r.staff_id)
    when 'site' then (select to_char(j.job_date, 'MM/DD') || ' ' || coalesce(j.title, '현장') from public.jobs j where j.id = r.job_id)
    else '대화방' end)
$$;

-- 이 직원의 기본 방 만들어두기 (전체 · 팀 · 1:1 · 현장)
create or replace function public._chat_ensure(s public.staff) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if public._chat_in_all(s.team) then
    insert into public.chat_rooms (kind) values ('all') on conflict do nothing;
  end if;
  if public._chat_grp(s.team) is not null then
    insert into public.chat_rooms (kind, grp) values ('team', public._chat_grp(s.team)) on conflict do nothing;
  end if;
  insert into public.chat_rooms (kind, staff_id) values ('dm', s.id) on conflict do nothing;
  insert into public.chat_rooms (kind, job_id)
    select 'site', j.id from public.jobs j
     where exists (select 1 from public.assignments a where a.job_id = j.id and a.staff_id = s.id and a.status = 'approved')
       and public._chat_site_live(j)
    on conflict do nothing;
end $$;

create or replace function public._chat_on(s public.staff) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select coalesce((select value #>> '{}' from public.settings where key = 'chat_on'), 'false') = 'true'
      or coalesce((select value from public.settings where key = 'chat_beta'), '[]'::jsonb) ? s.id::text
$$;

create or replace function public._chat_msg_json(m public.chat_messages, p_me uuid, p_admin boolean) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object(
    'id', m.id,
    'who', coalesce(m.staff_id::text, 'boss'),
    'name', coalesce((select name from public.staff where id = m.staff_id), '대표'),
    'avatar', (select avatar_path from public.staff where id = m.staff_id),
    'mine', case when p_me is null then m.staff_id is null else m.staff_id = p_me end,
    'body', case when m.deleted_at is null or p_admin then m.body end,
    'photo', case when m.deleted_at is null or p_admin then m.photo end,
    'at', m.created_at,
    'edited', m.edited_at is not null,
    'deleted', m.deleted_at is not null,
    'history', case when p_admin then m.history end)
$$;

-- 메시지별 안 읽은 사람 수 계산용
create or replace function public._chat_unread_map(r public.chat_rooms, p_from bigint) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  with mem as (
    select x::text as who from public._chat_members(r) x
    union all select 'boss'
  ), rd as (
    select mem.who, coalesce(cr.last_id, 0) as last_id from mem
      left join public.chat_reads cr on cr.room_id = r.id and cr.who = mem.who
  )
  select coalesce(jsonb_object_agg(m.id::text, (
           select count(*) from rd where rd.last_id < m.id and rd.who <> coalesce(m.staff_id::text, 'boss'))), '{}'::jsonb)
    from public.chat_messages m where m.room_id = r.id and m.id >= p_from
$$;

-- ------------------------------------------------------------
--  직원용
-- ------------------------------------------------------------
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
                         'name', coalesce((select name from public.staff where id = m.staff_id), '대표'), 'at', m.created_at)
                   from public.chat_messages m where m.room_id = r.id order by m.id desc limit 1),
        'last_at', (select max(created_at) from public.chat_messages m where m.room_id = r.id),
        'unread', (select count(*) from public.chat_messages m where m.room_id = r.id
                     and m.id > coalesce((select last_id from public.chat_reads where room_id = r.id and who = s.id::text), 0)
                     and (m.staff_id is distinct from s.id)),
        'n', (select count(*) from public._chat_members(r)) + 1
      ) x
      from public.chat_rooms r where public._chat_can(s, r)) q), '[]'::jsonb));
end $$;
grant execute on function public.chat_home(text) to anon, authenticated;

create or replace function public.chat_load(p_token text, p_room bigint, p_after bigint default 0, p_before bigint default null)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); r public.chat_rooms; msgs jsonb; mx bigint; mn bigint;
begin
  select * into r from public.chat_rooms where id = p_room;
  if r.id is null or not public._chat_on(s) or not public._chat_can(s, r) then raise exception 'no_room'; end if;
  select coalesce(jsonb_agg(public._chat_msg_json(m, s.id, false) order by m.id), '[]'::jsonb), max(m.id), min(m.id)
    into msgs, mx, mn
    from (select * from public.chat_messages
           where room_id = r.id and id > coalesce(p_after, 0) and (p_before is null or id < p_before)
           order by id desc limit 60) m;
  if mx is not null then
    insert into public.chat_reads (room_id, who, last_id) values (r.id, s.id::text, mx)
      on conflict (room_id, who) do update set last_id = greatest(public.chat_reads.last_id, excluded.last_id), at = now();
  end if;
  return jsonb_build_object('room', jsonb_build_object('id', r.id, 'kind', r.kind, 'title', case when r.kind = 'dm' then '대표님' else public._chat_title(r) end,
      'members', (select jsonb_agg(jsonb_build_object('name', st.name, 'avatar', st.avatar_path, 'role', st.role) order by st.name)
                    from public.staff st where st.id in (select public._chat_members(r)))),
    'msgs', msgs,
    'unread', public._chat_unread_map(r, coalesce(least(mn, (select coalesce(max(id),0) - 200 from public.chat_messages where room_id = r.id)), 0)));
end $$;
grant execute on function public.chat_load(text, bigint, bigint, bigint) to anon, authenticated;

create or replace function public.chat_send(p_token text, p_room bigint, p_body text, p_photo text default null)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); r public.chat_rooms; nid bigint;
begin
  select * into r from public.chat_rooms where id = p_room;
  if r.id is null or not public._chat_on(s) or not public._chat_can(s, r) then raise exception 'no_room'; end if;
  if coalesce(trim(p_body), '') = '' and p_photo is null then raise exception 'empty'; end if;
  if p_photo is not null and (s.avatar_key is null or split_part(p_photo, '/', 1) <> s.avatar_key) then raise exception 'bad_path'; end if;
  insert into public.chat_messages (room_id, staff_id, body, photo) values (r.id, s.id, left(p_body, 4000), p_photo) returning id into nid;
  insert into public.chat_reads (room_id, who, last_id) values (r.id, s.id::text, nid)
    on conflict (room_id, who) do update set last_id = excluded.last_id, at = now();
  update public.staff set last_seen_at = now() where id = s.id;
  return nid;
end $$;
grant execute on function public.chat_send(text, bigint, text, text) to anon, authenticated;

-- 수정 · 삭제 (본인 글만, 원문은 history에 남음)
create or replace function public.chat_edit(p_token text, p_id bigint, p_body text, p_delete boolean default false)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); m public.chat_messages;
begin
  select * into m from public.chat_messages where id = p_id;
  if m.id is null or m.staff_id is distinct from s.id or m.deleted_at is not null then raise exception 'no_msg'; end if;
  update public.chat_messages
     set history = history || jsonb_build_array(jsonb_build_object('body', m.body, 'photo', m.photo, 'at', now(), 'act', case when p_delete then 'delete' else 'edit' end)),
         body = case when p_delete then body else left(p_body, 4000) end,
         edited_at = case when p_delete then edited_at else now() end,
         deleted_at = case when p_delete then now() else null end
   where id = p_id;
  return 'ok';
end $$;
grant execute on function public.chat_edit(text, bigint, text, boolean) to anon, authenticated;

-- ------------------------------------------------------------
--  대표용 (HQ 로그인)
-- ------------------------------------------------------------
create or replace function public.chat_admin_home() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare st public.staff;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  for st in select * from public.staff where status <> 'left' and not hidden loop
    perform public._chat_ensure(st);
  end loop;
  return jsonb_build_object(
    'on', coalesce((select value #>> '{}' from public.settings where key = 'chat_on'), 'false') = 'true',
    'rooms', coalesce((select jsonb_agg(x order by (x->>'closed')::boolean, (x->>'kind_o')::int, x->>'last_at' desc nulls last) from (
      select jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'grp', r.grp, 'title', public._chat_title(r), 'custom_title', r.title,
        'staff_id', r.staff_id, 'job_id', r.job_id, 'keep', r.keep,
        'closed', r.closed_at is not null, 'closed_at', r.closed_at, 'created_at', r.created_at,
        'live', r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j)),
        'left_at', case when r.kind = 'dm' then (select left_at from public.staff where id = r.staff_id) end,
        'kind_o', case r.kind when 'all' then 1 when 'team' then 2 when 'custom' then 3 when 'site' then 4 else 5 end,
        'last', (select jsonb_build_object('body', case when m.deleted_at is not null then '삭제된 메시지' when coalesce(m.body,'') = '' then '사진' else m.body end,
                         'name', coalesce((select name from public.staff where id = m.staff_id), '대표'), 'at', m.created_at)
                   from public.chat_messages m where m.room_id = r.id order by m.id desc limit 1),
        'last_at', (select max(created_at) from public.chat_messages m where m.room_id = r.id),
        'count', (select count(*) from public.chat_messages m where m.room_id = r.id),
        'unread', (select count(*) from public.chat_messages m where m.room_id = r.id and m.staff_id is not null
                     and m.id > coalesce((select last_id from public.chat_reads where room_id = r.id and who = 'boss'), 0)),
        'members', (select coalesce(jsonb_agg(x2), '[]'::jsonb) from public._chat_members(r) x2)
      ) x
      from public.chat_rooms r) q), '[]'::jsonb));
end $$;
grant execute on function public.chat_admin_home() to authenticated;

create or replace function public.chat_admin_load(p_room bigint, p_after bigint default 0, p_before bigint default null, p_limit int default 80)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare r public.chat_rooms; msgs jsonb; mx bigint; mn bigint;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into r from public.chat_rooms where id = p_room;
  select coalesce(jsonb_agg(public._chat_msg_json(m, null, true) order by m.id), '[]'::jsonb), max(m.id), min(m.id)
    into msgs, mx, mn
    from (select * from public.chat_messages
           where room_id = r.id and id > coalesce(p_after, 0) and (p_before is null or id < p_before)
           order by id desc limit greatest(1, least(p_limit, 5000))) m;
  if mx is not null then
    insert into public.chat_reads (room_id, who, last_id) values (r.id, 'boss', mx)
      on conflict (room_id, who) do update set last_id = greatest(public.chat_reads.last_id, excluded.last_id), at = now();
  end if;
  return jsonb_build_object('room', jsonb_build_object('id', r.id, 'kind', r.kind, 'title', public._chat_title(r),
      'members', (select jsonb_agg(jsonb_build_object('id', st.id, 'name', st.name, 'avatar', st.avatar_path, 'role', st.role) order by st.name)
                    from public.staff st where st.id in (select public._chat_members(r)))),
    'msgs', msgs,
    'unread', public._chat_unread_map(r, coalesce(mn, 0)));
end $$;
grant execute on function public.chat_admin_load(bigint, bigint, bigint, int) to authenticated;

create or replace function public.chat_admin_send(p_room bigint, p_body text, p_photo text default null)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare nid bigint;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if coalesce(trim(p_body), '') = '' and p_photo is null then raise exception 'empty'; end if;
  insert into public.chat_messages (room_id, staff_id, admin_uid, body, photo)
    values (p_room, null, auth.uid(), left(p_body, 4000), p_photo) returning id into nid;
  insert into public.chat_reads (room_id, who, last_id) values (p_room, 'boss', nid)
    on conflict (room_id, who) do update set last_id = excluded.last_id, at = now();
  return nid;
end $$;
grant execute on function public.chat_admin_send(bigint, text, text) to authenticated;

-- 대표가 만든 방: 새로 만들기(p_id null) · 이름·인원 바꾸기
create or replace function public.chat_admin_room_save(p_id bigint, p_title text, p_members uuid[])
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare rid bigint := p_id;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if rid is null then
    insert into public.chat_rooms (kind, title) values ('custom', nullif(trim(p_title), '')) returning id into rid;
  else
    update public.chat_rooms set title = nullif(trim(p_title), '') where id = rid;
  end if;
  if (select kind from public.chat_rooms where id = rid) = 'custom' then
    delete from public.chat_members where room_id = rid and not (staff_id = any(coalesce(p_members, '{}')));
    insert into public.chat_members (room_id, staff_id) select rid, unnest(coalesce(p_members, '{}')) on conflict do nothing;
  end if;
  return rid;
end $$;
grant execute on function public.chat_admin_room_save(bigint, text, uuid[]) to authenticated;

-- 닫기(보관) · 다시 열기 · 보관 고정
create or replace function public.chat_admin_room_flag(p_id bigint, p_closed boolean default null, p_keep boolean default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.chat_rooms
     set closed_at = case when p_closed is null then closed_at when p_closed then coalesce(closed_at, now()) else null end,
         keep = coalesce(p_keep, keep)
   where id = p_id;
  return 'ok';
end $$;
grant execute on function public.chat_admin_room_flag(bigint, boolean, boolean) to authenticated;

-- 직원에게 열기 / 닫기 , 미리 써볼 직원(beta)
create or replace function public.chat_admin_set(p_on boolean default null, p_beta uuid[] default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  if p_on is not null then
    insert into public.settings (key, value) values ('chat_on', to_jsonb(p_on))
      on conflict (key) do update set value = excluded.value;
  end if;
  if p_beta is not null then
    insert into public.settings (key, value) values ('chat_beta', to_jsonb(p_beta::text[]))
      on conflict (key) do update set value = excluded.value;
  end if;
  return 'ok';
end $$;
grant execute on function public.chat_admin_set(boolean, uuid[]) to authenticated;

-- 퇴사자 1:1 정리 (대표가 직접 누를 때만 · 보관 고정 방은 안 됨)
create or replace function public.chat_admin_purge(p_id bigint) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare r public.chat_rooms;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into r from public.chat_rooms where id = p_id;
  if r.kind <> 'dm' or r.keep or not exists (select 1 from public.staff where id = r.staff_id and status = 'left') then raise exception 'not_allowed'; end if;
  delete from public.chat_rooms where id = p_id;
  return 'ok';
end $$;
grant execute on function public.chat_admin_purge(bigint) to authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 5 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v5)' as result;
