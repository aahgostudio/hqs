-- ============================================================
--  내 현장 다이어리 (2026-11-08)
--   · 직원: 내가 다녀간 현장이 날짜별로 쌓임 (전·후 사진, 함께한 사람, 오늘의 한마디)
--   · 반응(👏💪🔥❤️😂) + 댓글로 서로 소통
--   · 대표: 한마디·대문 사진 고치기, 댓글 달기 (HQ 현장 카드)
--   · 고객 이름·전화·주소·금액은 안 줌
-- ============================================================
alter table public.jobs
  add column if not exists diary_note  text,     -- 오늘의 한마디 (비우면 자동 문구)
  add column if not exists diary_cover text;     -- 대문 = 블로그 썸네일 (live 버킷 경로)

create table if not exists public.diary_react (
  job_id     bigint not null references public.jobs(id) on delete cascade,
  who        text   not null,                    -- staff.id 또는 'boss'
  emoji      text   not null,
  created_at timestamptz not null default now(),
  primary key (job_id, who, emoji)
);
create table if not exists public.diary_comment (
  id         bigint generated always as identity primary key,
  job_id     bigint not null references public.jobs(id) on delete cascade,
  staff_id   uuid references public.staff(id) on delete set null,
  boss       boolean not null default false,
  body       text not null,
  hidden     boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists diary_comment_job on public.diary_comment (job_id);
create index if not exists diary_react_job on public.diary_react (job_id);

alter table public.diary_react enable row level security;
alter table public.diary_comment enable row level security;
drop policy if exists "owner_all" on public.diary_react;
drop policy if exists "owner_all" on public.diary_comment;
create policy "owner_all" on public.diary_react for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "owner_all" on public.diary_comment for all to authenticated using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.diary_react, public.diary_comment to authenticated;

-- 대표님이 대문(블로그 썸네일) 올리는 자리: live 버킷 diary/ 폴더
drop policy if exists "live_diary_owner" on storage.objects;
create policy "live_diary_owner" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'live' and (storage.foldername(name))[1] = 'diary' and public.is_owner());

-- 다이어리 볼 수 있는 직원 (부동산·아고 파트너 빼고)
create or replace function public._diary_me(p_token text) returns public.staff
language plpgsql stable security definer set search_path = public, extensions as $$
declare s public.staff;
begin
  s := public._me(p_token);
  if coalesce(s.team, '') in ('RES', 'AGO') then raise exception 'not_allowed'; end if;
  return s;
end $$;
revoke all on function public._diary_me(text) from public, anon, authenticated;

-- 현장 하나 → 다이어리 한 칸
create or replace function public._diary_item(j public.jobs, p_no bigint, p_me uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with ph as (
    select p.path, p.stage, p.created_at from public.job_photos p
     where p.job_id = j.id and not p.hidden and coalesce(p.bucket, 'live') = 'live'
       and lower(p.path) !~ '\.(mp4|mov|webm|m4v|heic|heif|pdf)$')
  select jsonb_build_object(
    'id', j.id, 'no', p_no, 'date', j.job_date, 'title', coalesce(nullif(j.live_title, ''), j.title), 'kind', j.kind,
    'crew', (select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb) from public.assignments a join public.staff s on s.id = a.staff_id
              where a.job_id = j.id and a.status = 'approved'),
    'boss', coalesce(j.boss_on, false),
    'note', j.diary_note, 'cover', j.diary_cover,
    'before', (select path from ph order by (stage = 'before') desc, created_at asc limit 1),
    'after',  (select path from ph order by (stage = 'after') desc, created_at desc limit 1),
    'photo_n', (select count(*) from ph),
    'rx', (select coalesce(jsonb_object_agg(emoji, n), '{}'::jsonb) from (select emoji, count(*) n from public.diary_react where job_id = j.id group by emoji) z),
    'my_rx', (select coalesce(jsonb_agg(emoji), '[]'::jsonb) from public.diary_react where job_id = j.id and who = p_me::text),
    'cm_n', (select count(*) from public.diary_comment where job_id = j.id and not hidden),
    'mine', exists (select 1 from public.assignments a where a.job_id = j.id and a.staff_id = p_me and a.status = 'approved'))
$$;
revoke all on function public._diary_item(public.jobs, bigint, uuid) from public, anon, authenticated;

-- 목록: p_scope 'mine'(내가 간 곳) / 'all'(우리 모두), p_month 그 달
create or replace function public.staff_diary(p_token text, p_scope text default 'mine', p_month date default null)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare me public.staff; t date := public._today(); m0 date; m1 date; res jsonb;
begin
  me := public._diary_me(p_token);
  m0 := date_trunc('month', coalesce(p_month, t))::date; m1 := (m0 + interval '1 month')::date;
  with base as (
    select j, j.id, j.job_date, row_number() over (order by j.job_date, j.id) as no
      from public.jobs j where j.job_date <= t and j.status not in ('cancelled', 'quote')
  ), mine as (
    select distinct a.job_id from public.assignments a where a.staff_id = me.id and a.status = 'approved'
  )
  select jsonb_build_object(
    'me', me.name,
    'total', (select count(*) from base),
    'mine_total', (select count(*) from base b join mine on mine.job_id = b.id),
    'month_n', (select count(*) from base b where b.job_date >= m0 and b.job_date < m1),
    'month_mine', (select count(*) from base b join mine on mine.job_id = b.id where b.job_date >= m0 and b.job_date < m1),
    'cheers', (select count(*) from public.diary_react r join mine on mine.job_id = r.job_id where r.who <> me.id::text),
    'first', (select min(b.job_date) from base b join mine on mine.job_id = b.id),
    'items', coalesce((select jsonb_agg(public._diary_item(b.j, b.no, me.id) order by b.job_date desc, b.no desc)
                         from base b where b.job_date >= m0 and b.job_date < m1
                          and (p_scope = 'all' or b.id in (select job_id from mine))), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- 하루 열기: 사진 전체 + 이야기(댓글)
create or replace function public.staff_diary_one(p_token text, p_job bigint)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare me public.staff; j public.jobs; n bigint;
begin
  me := public._diary_me(p_token);
  select * into j from public.jobs where id = p_job and status not in ('cancelled', 'quote') and job_date <= public._today();
  if not found then raise exception 'not_found'; end if;
  select count(*) into n from public.jobs x where x.status not in ('cancelled', 'quote') and x.job_date <= public._today()
     and (x.job_date < j.job_date or (x.job_date = j.job_date and x.id <= j.id));
  return public._diary_item(j, n, me.id) || jsonb_build_object(
    'photos', (select coalesce(jsonb_agg(p.path order by p.created_at), '[]'::jsonb) from public.job_photos p
                where p.job_id = j.id and not p.hidden and coalesce(p.bucket, 'live') = 'live'
                  and lower(p.path) !~ '\.(mp4|mov|webm|m4v|heic|heif|pdf)$'),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', c.id, 'body', c.body, 'at', c.created_at, 'boss', c.boss, 'mine', c.staff_id = me.id,
                    'name', case when c.boss then '권성환' else s.name end,
                    'role', case when c.boss then '대표' else coalesce(nullif(s.role, ''), '') end) order by c.created_at), '[]'::jsonb)
                  from public.diary_comment c left join public.staff s on s.id = c.staff_id
                 where c.job_id = j.id and not c.hidden));
end $$;

-- 반응 누르기 (한 번 더 누르면 취소)
create or replace function public.staff_diary_react(p_token text, p_job bigint, p_emoji text)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare me public.staff; k int;
begin
  me := public._diary_me(p_token);
  if p_emoji not in ('👏', '💪', '🔥', '❤️', '😂') then raise exception 'not_allowed'; end if;
  if not exists (select 1 from public.jobs where id = p_job and job_date <= public._today()) then raise exception 'not_found'; end if;
  delete from public.diary_react where job_id = p_job and who = me.id::text and emoji = p_emoji;
  get diagnostics k = row_count;
  if k = 0 then insert into public.diary_react (job_id, who, emoji) values (p_job, me.id::text, p_emoji); end if;
  return jsonb_build_object(
    'rx', (select coalesce(jsonb_object_agg(emoji, n), '{}'::jsonb) from (select emoji, count(*) n from public.diary_react where job_id = p_job group by emoji) z),
    'my_rx', (select coalesce(jsonb_agg(emoji), '[]'::jsonb) from public.diary_react where job_id = p_job and who = me.id::text));
end $$;

-- 이야기 남기기 / 내 것 지우기
create or replace function public.staff_diary_comment(p_token text, p_job bigint, p_body text)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare me public.staff; nid bigint;
begin
  me := public._diary_me(p_token);
  if length(trim(coalesce(p_body, ''))) = 0 then raise exception 'empty'; end if;
  if not exists (select 1 from public.jobs where id = p_job and job_date <= public._today()) then raise exception 'not_found'; end if;
  insert into public.diary_comment (job_id, staff_id, body) values (p_job, me.id, left(trim(p_body), 300)) returning id into nid;
  return nid;
end $$;
create or replace function public.staff_diary_comment_del(p_token text, p_id bigint)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare me public.staff;
begin
  me := public._diary_me(p_token);
  update public.diary_comment set hidden = true where id = p_id and staff_id = me.id;
end $$;

-- 새 소식 개수 (내 현장에 다른 사람이 남긴 반응·이야기) — 하단 메뉴 빨간 숫자
create or replace function public.staff_diary_new(p_token text, p_since timestamptz)
returns int language plpgsql stable security definer set search_path = public, extensions as $$
declare me public.staff;
begin
  me := public._diary_me(p_token);
  return (select count(*) from public.diary_comment c join public.assignments a on a.job_id = c.job_id and a.staff_id = me.id and a.status = 'approved'
           where not c.hidden and c.created_at > coalesce(p_since, now() - interval '7 days') and c.staff_id is distinct from me.id)
       + (select count(*) from public.diary_react r join public.assignments a on a.job_id = r.job_id and a.staff_id = me.id and a.status = 'approved'
           where r.created_at > coalesce(p_since, now() - interval '7 days') and r.who <> me.id::text);
end $$;

grant execute on function public.staff_diary(text, text, date), public.staff_diary_one(text, bigint), public.staff_diary_react(text, bigint, text),
  public.staff_diary_comment(text, bigint, text), public.staff_diary_comment_del(text, bigint), public.staff_diary_new(text, timestamptz) to anon, authenticated;

notify pgrst, 'reload schema';
select '업데이트 완료 · 내 현장 다이어리' as result;
