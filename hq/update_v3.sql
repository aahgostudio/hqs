-- ============================================================
--  어닝플레이스 HQ 업데이트 v3 (2026-10-27)
--  ① 직원 프로필 사진 (본인이 개인 화면에서 올림 → HQ·매물노트에 보임)
--  ② 명단에서 완전히 숨기기 (hidden) + 문나원 퇴사 처리
--  ③ 정기 일정 반복 (series_id · series_rule)
--  Supabase → SQL Editor → 붙여넣고 Run → '업데이트 완료 (v3)'
-- ============================================================

alter table public.staff add column if not exists avatar_path text;
alter table public.staff add column if not exists avatar_key  text;
alter table public.staff add column if not exists hidden      boolean not null default false;

-- 정기 반복 일정 묶음
alter table public.jobs add column if not exists series_id   text;
alter table public.jobs add column if not exists series_rule jsonb;
create index if not exists jobs_series_idx on public.jobs (series_id, job_date) where series_id is not null;

-- 프로필 사진 저장소 (공개, 추측 불가 경로, 2MB)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function public.avatar_upload_ok(p_key text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.staff where avatar_key = p_key and status <> 'left')
$$;
grant execute on function public.avatar_upload_ok(text) to anon, authenticated;

drop policy if exists "avatar_upload" on storage.objects;
create policy "avatar_upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'avatars' and public.avatar_upload_ok((storage.foldername(name))[1]));
drop policy if exists "avatar_admin_delete" on storage.objects;
create policy "avatar_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'avatars' and public.is_admin());

-- 사진 올릴 자리 받기 (직원 본인 링크로만)
create or replace function public.staff_avatar_slot(p_token text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); k text;
begin
  k := s.avatar_key;
  if k is null then
    k := encode(gen_random_bytes(12), 'hex');
    update public.staff set avatar_key = k where id = s.id;
  end if;
  return k;
end $$;
grant execute on function public.staff_avatar_slot(text) to anon, authenticated;

-- 올린 사진을 내 프로필로 (null = 사진 지우기)
create or replace function public.staff_set_avatar(p_token text, p_path text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  if p_path is not null and (s.avatar_key is null or split_part(p_path, '/', 1) <> s.avatar_key) then
    raise exception 'bad_path';
  end if;
  update public.staff set avatar_path = p_path where id = s.id;
  return 'ok';
end $$;
grant execute on function public.staff_set_avatar(text, text) to anon, authenticated;

-- 나 + 같은 팀 사진 (매물노트·일정판 화면용). 대표 매물노트 링크면 부동산 전원.
create or replace function public.staff_avatars(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare s public.staff; boss boolean;
begin
  boss := exists (select 1 from public.settings where key = 'hq_maemul_code' and value #>> '{}' = p_token);
  if not boss then s := public._me(p_token); end if;
  return jsonb_build_object(
    'me', case when boss then null else jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role, 'avatar', s.avatar_path) end,
    'team', coalesce((select jsonb_agg(jsonb_build_object('name', t.name, 'role', t.role, 'avatar', t.avatar_path))
       from public.staff t
      where t.status <> 'left' and not t.hidden
        and (case when boss then t.team = 'RES' else t.team = s.team end)), '[]'::jsonb));
end $$;
grant execute on function public.staff_avatars(text) to anon, authenticated;

-- 문나원: 2026-10-26부로 퇴사 → 링크 막고, 명단에서 완전히 숨김, 오늘 이후 배정 빼기
-- (지난 근무 기록·정산은 그대로 남아요)
update public.staff set status = 'left', hidden = true where name = '문나원';
delete from public.assignments a using public.jobs j, public.staff s
 where a.job_id = j.id and a.staff_id = s.id and s.name = '문나원'
   and j.job_date >= (now() at time zone 'Asia/Seoul')::date;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 3 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v3)' as result;
