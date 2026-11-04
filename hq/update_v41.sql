-- ============================================================
--  어닝플레이스 HQ 업데이트 v41 (2026-11-04)
--  영업파트너 대화 — 📣 파트너 공지방(전체) + 💬 리츠와 1:1
-- ============================================================
create table if not exists public.partner_msgs (
  id          bigint generated always as identity primary key,
  partner_id  bigint references public.partners(id) on delete cascade,   -- null = 공지방(전체)
  from_hq     boolean not null default true,
  author      text,                                   -- 보낸 사람 이름 (본사 쪽)
  body        text not null,
  hq_read_at  timestamptz,                            -- 파트너가 보낸 글을 본사가 읽은 시각
  created_at  timestamptz not null default now()
);
create index if not exists partner_msgs_pid_idx on public.partner_msgs(partner_id, created_at desc);
alter table public.partners add column if not exists read_notice_at timestamptz;
alter table public.partners add column if not exists read_dm_at timestamptz;

alter table public.partner_msgs enable row level security;
drop policy if exists "admin_all" on public.partner_msgs;
create policy "admin_all" on public.partner_msgs for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 파트너: 안 읽은 수 (홈 배지용)
create or replace function public.partner_unread(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.partners := public._partner(p_token);
begin
  return jsonb_build_object(
    'notice', (select count(*) from public.partner_msgs where partner_id is null and created_at > coalesce(p.read_notice_at, p.created_at - interval '30 days')),
    'dm', (select count(*) from public.partner_msgs where partner_id = p.id and from_hq and created_at > coalesce(p.read_dm_at, 'epoch'::timestamptz)));
end $$;

-- 파트너: 대화 불러오기 (열면 읽음 처리)
create or replace function public.partner_chat(p_token text, p_room text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p public.partners := public._partner(p_token); r jsonb;
begin
  if p_room = 'notice' then
    select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb) into r from (
      select jsonb_build_object('id', id, 'from_hq', true, 'author', author, 'body', body, 'created_at', created_at) x
        from public.partner_msgs where partner_id is null order by created_at desc limit 60) t;
    update public.partners set read_notice_at = now() where id = p.id;
  else
    select coalesce(jsonb_agg(x order by x->>'created_at'), '[]'::jsonb) into r from (
      select jsonb_build_object('id', id, 'from_hq', from_hq, 'author', author, 'body', body, 'created_at', created_at) x
        from public.partner_msgs where partner_id = p.id order by created_at desc limit 150) t;
    update public.partners set read_dm_at = now() where id = p.id;
  end if;
  return r;
end $$;

-- 파트너: 1:1 보내기
create or replace function public.partner_send(p_token text, p_body text) returns text
language plpgsql security definer set search_path = public as $$
declare p public.partners := public._partner(p_token);
begin
  if coalesce(trim(p_body),'') = '' then raise exception '내용을 적어주세요'; end if;
  if (select count(*) from public.partner_msgs where partner_id = p.id and not from_hq and created_at > now() - interval '1 minute') >= 10 then
    raise exception '잠시 뒤에 다시 보내주세요'; end if;
  insert into public.partner_msgs(partner_id, from_hq, author, body) values (p.id, false, p.name, left(trim(p_body), 2000));
  return 'ok';
end $$;

grant execute on function public.partner_unread(text) to anon, authenticated;
grant execute on function public.partner_chat(text, text) to anon, authenticated;
grant execute on function public.partner_send(text, text) to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(41, 0) $$;

select '업데이트 완료 (v41) · 파트너 대화' as result;
