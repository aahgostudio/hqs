-- ============================================================
--  어닝플레이스 HQ 업데이트 v7 (2026-10-27)
--  인사카드 대표 전용 금고: 주민등록번호 · 계좌 · 주소 · 비상연락처
--   · 대표님 비밀번호로 화면(브라우저)에서 암호화한 뒤 저장 → 서버엔 알아볼 수 없는 글자만 남아요
--   · 대표 계정만 읽기·쓰기 (관리자·직원·외부 접근 불가)
--  Supabase → SQL Editor → 붙여넣고 Run → '업데이트 완료 (v7)'
-- ============================================================

create table if not exists public.staff_private (
  staff_id   uuid primary key references public.staff(id) on delete cascade,
  enc        text not null,                 -- AES-GCM 암호문 (대표 비밀번호로만 풀림)
  updated_at timestamptz not null default now()
);
alter table public.staff_private enable row level security;
drop policy if exists "owner_all" on public.staff_private;
create policy "owner_all" on public.staff_private for all to authenticated using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.staff_private to authenticated;
revoke all on public.staff_private from anon;

-- 금고 열쇠 확인용 (소금값 + '열림' 확인 암호문) — 대표만
create table if not exists public.vault_meta (
  id    int primary key default 1 check (id = 1),
  salt  text not null,
  check_enc text not null,
  created_at timestamptz not null default now()
);
alter table public.vault_meta enable row level security;
drop policy if exists "owner_all" on public.vault_meta;
create policy "owner_all" on public.vault_meta for all to authenticated using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.vault_meta to authenticated;
revoke all on public.vault_meta from anon;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 7 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v7)' as result;
