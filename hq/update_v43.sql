-- ============================================================
--  어닝플레이스 HQ 업데이트 v43 (2026-11-05)
--  영업파트너 사진 자료함 — 본사가 고른 현장 사진(작업 전·후)을 파트너가 받아 홍보
--  · partner_kit : 앨범 (제목·종류·자랑 문구·사진 목록)
--  · kit 버킷   : 현장 사진 말고 따로 올리는 사진 (관리자만 올림, 공개 주소)
--  · partner_kit(token) : 파트너 화면에서 앨범 불러오기
-- ============================================================
create table if not exists public.partner_kit (
  id          bigint generated always as identity primary key,
  title       text not null,                          -- 예) 해운대 카페 준공청소
  kind        text,                                   -- 준공·인테리어 후 / 상가·사무실 정기 ...
  caption     text,                                   -- 자랑 문구 (파트너가 복사해서 보냄)
  photos      jsonb not null default '[]'::jsonb,     -- [{path, bucket, stage}]
  job_id      bigint references public.jobs(id) on delete set null,
  sort        int not null default 0,
  hidden      boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table public.partner_kit enable row level security;
drop policy if exists "admin_all" on public.partner_kit;
create policy "admin_all" on public.partner_kit for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- 직접 올리는 사진 저장소
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kit', 'kit', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "kit_admin_upload" on storage.objects;
create policy "kit_admin_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'kit' and public.is_admin());
drop policy if exists "kit_admin_delete" on storage.objects;
create policy "kit_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'kit' and public.is_admin());

-- 파트너: 사진 자료 불러오기
create or replace function public.partner_kit(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.partners := public._partner(p_token);
begin
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'title', title, 'kind', kind, 'caption', caption, 'photos', photos)
                     order by sort desc, created_at desc)
                     from public.partner_kit where not hidden and jsonb_array_length(photos) > 0), '[]'::jsonb);
end $$;
grant execute on function public.partner_kit(text) to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(43, 0) $$;

select '업데이트 완료 (v43) · 파트너 사진 자료함' as result;
