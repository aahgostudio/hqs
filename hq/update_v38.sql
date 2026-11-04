-- ============================================================
--  어닝플레이스 HQ 업데이트 v38 (2026-11-04)
--  대화 꾹 누르기 메뉴: 수정·삭제(대표·관리자 글) · 반응(👍✅🙏❤️) · 방 위에 고정
-- ============================================================
create table if not exists public.chat_reacts (
  msg_id bigint not null references public.chat_messages(id) on delete cascade,
  who    text   not null,
  emoji  text   not null,
  at     timestamptz not null default now(),
  primary key (msg_id, who)
);
alter table public.chat_reacts enable row level security;
alter table public.chat_rooms add column if not exists pin_msg bigint;

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
              from public.chat_messages o where o.id = m.reply_to),
    -- v38: 반응 (👍 ✅ 🙏 ❤️) — 이모지별 개수 · 내가 누른 것
    'reacts', (select jsonb_agg(jsonb_build_object('e', e, 'n', n, 'me', me, 'who', who) order by n desc, e)
                 from (select x.emoji e, count(*) n,
                              bool_or(x.who = case when p_me is not null then p_me::text else public._chat_who() end) me,
                              jsonb_agg(coalesce((select name from public.staff where id::text = x.who), case when x.who = 'boss' then '대표' else '관리자' end)) who
                         from public.chat_reacts x where x.msg_id = m.id group by x.emoji) q))
$$;

-- 반응: 직원 (같은 이모지 다시 누르면 취소, 다른 이모지면 바꿈)
create or replace function public.chat_react(p_token text, p_msg bigint, p_emoji text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); m public.chat_messages; r public.chat_rooms; cur text;
begin
  select * into m from public.chat_messages where id = p_msg; select * into r from public.chat_rooms where id = m.room_id;
  if m.id is null or not public._chat_can(s, r) then raise exception 'no_msg'; end if;
  select emoji into cur from public.chat_reacts where msg_id = p_msg and who = s.id::text;
  if cur = p_emoji then delete from public.chat_reacts where msg_id = p_msg and who = s.id::text; return 'off'; end if;
  insert into public.chat_reacts (msg_id, who, emoji) values (p_msg, s.id::text, left(p_emoji, 8))
    on conflict (msg_id, who) do update set emoji = excluded.emoji, at = now();
  return 'on';
end $$;
grant execute on function public.chat_react(text, bigint, text) to anon, authenticated;

-- 반응: 대표·관리자
create or replace function public.chat_admin_react(p_msg bigint, p_emoji text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare me text := public._chat_who(); cur text;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select emoji into cur from public.chat_reacts where msg_id = p_msg and who = me;
  if cur = p_emoji then delete from public.chat_reacts where msg_id = p_msg and who = me; return 'off'; end if;
  insert into public.chat_reacts (msg_id, who, emoji) values (p_msg, me, left(p_emoji, 8))
    on conflict (msg_id, who) do update set emoji = excluded.emoji, at = now();
  return 'on';
end $$;
grant execute on function public.chat_admin_react(bigint, text) to authenticated;

-- 수정·삭제: 대표·관리자가 쓴 글 (이력은 남음)
create or replace function public.chat_admin_edit(p_id bigint, p_body text, p_delete boolean default false)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare m public.chat_messages;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into m from public.chat_messages where id = p_id;
  if m.id is null or m.staff_id is not null or m.cust or m.deleted_at is not null
     or not (m.admin_uid = auth.uid() or (m.admin_uid is null and public.is_owner())) then raise exception 'no_msg'; end if;
  update public.chat_messages
     set history = coalesce(history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('body', m.body, 'photo', m.photo, 'at', now(), 'act', case when p_delete then 'delete' else 'edit' end)),
         body = case when p_delete then body else left(p_body, 4000) end,
         edited_at = case when p_delete then edited_at else now() end,
         deleted_at = case when p_delete then now() else null end
   where id = p_id;
  return 'ok';
end $$;
grant execute on function public.chat_admin_edit(bigint, text, boolean) to authenticated;

-- 방 위에 고정 (대표·관리자) · 보기 (직원·대표)
create or replace function public.chat_admin_pin(p_room bigint, p_msg bigint)
returns text language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  update public.chat_rooms set pin_msg = p_msg where id = p_room;
  return 'ok';
end $$;
grant execute on function public.chat_admin_pin(bigint, bigint) to authenticated;

create or replace function public._chat_pin_json(r public.chat_rooms) returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('id', m.id, 'body', left(m.body, 200), 'photo', m.photo,
           'name', coalesce((select name from public.staff where id = m.staff_id), '대표'))
    from public.chat_messages m where m.id = r.pin_msg and m.deleted_at is null and m.room_id = r.id
$$;
create or replace function public.chat_admin_pin_get(p_room bigint) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare r public.chat_rooms;
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  select * into r from public.chat_rooms where id = p_room;
  return public._chat_pin_json(r);
end $$;
grant execute on function public.chat_admin_pin_get(bigint) to authenticated;
create or replace function public.chat_pin_get(p_token text, p_room bigint) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); r public.chat_rooms;
begin
  select * into r from public.chat_rooms where id = p_room;
  if r.id is null or not public._chat_can(s, r) then return null; end if;
  return public._chat_pin_json(r);
end $$;
grant execute on function public.chat_pin_get(text, bigint) to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(38, 0) $$;

select '업데이트 완료 (v38) · 대화 메뉴 (수정·삭제·반응·고정)' as result;
