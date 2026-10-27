-- ============================================================
--  어닝플레이스 HQ 업데이트 v8 (2026-10-27)
--  인사카드 대표 전용 칸: 비밀번호 없이 대표 계정으로 바로 보기
--   · 서버 안에서 자동 암호화해서 저장 (주민번호 암호화 보관)
--   · 대표 계정만 읽기·쓰기 (관리자·직원·외부 불가)
--  Supabase → SQL Editor → 붙여넣고 Run → '업데이트 완료 (v8)'
-- ============================================================

-- 암호화 열쇠: 어떤 계정도 직접 못 읽는 표 (함수만 사용)
create table if not exists public.vault_key (id int primary key default 1 check (id = 1), k text not null);
alter table public.vault_key enable row level security;
revoke all on public.vault_key from anon, authenticated;
insert into public.vault_key (id, k) values (1, encode(extensions.gen_random_bytes(32), 'hex')) on conflict (id) do nothing;

-- 비밀번호 방식(v7) 정리 — 저장된 정보가 없을 때만
delete from public.vault_meta;
delete from public.staff_private where enc not like '-----BEGIN PGP%';

create or replace function public.vault_get(p_staff uuid) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare e text;
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  select enc into e from public.staff_private where staff_id = p_staff;
  if e is null then return '{}'::jsonb; end if;
  return extensions.pgp_sym_decrypt(extensions.dearmor(e), (select k from public.vault_key where id = 1))::jsonb;
end $$;
revoke all on function public.vault_get(uuid) from anon;
grant execute on function public.vault_get(uuid) to authenticated;

create or replace function public.vault_set(p_staff uuid, p_data jsonb) returns text
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() then raise exception 'owner_only'; end if;
  insert into public.staff_private (staff_id, enc, updated_at)
    values (p_staff, extensions.armor(extensions.pgp_sym_encrypt(p_data::text, (select k from public.vault_key where id = 1))), now())
    on conflict (staff_id) do update set enc = excluded.enc, updated_at = now();
  return 'ok';
end $$;
revoke all on function public.vault_set(uuid, jsonb) from anon;
grant execute on function public.vault_set(uuid, jsonb) to authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 8 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v8)' as result;
