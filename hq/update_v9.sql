-- ============================================================
--  어닝플레이스 HQ 업데이트 v9 (2026-10-27)  ※ v8 포함 — 이것 하나만 돌리면 돼요
--  ① 인사카드 대표 전용 칸 (주민번호·계좌 서버 자동 암호화, 비밀번호 없음)
--  ② 입금 기록: 대표님이 1:1 방에 "준호님 7 넣었어요" 보내면 자동 기록 (7 = 7만원)
--     · 글을 고치면 금액도 고쳐지고, 지우면 기록도 취소 표시
--  Supabase → SQL Editor → 붙여넣고 Run → '업데이트 완료 (v9)'
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


-- ---------- 입금 기록 ----------
create table if not exists public.payouts (
  id         bigserial primary key,
  staff_id   uuid not null references public.staff(id) on delete cascade,
  amount     int  not null,
  paid_on    date not null,
  msg_id     bigint unique references public.chat_messages(id) on delete set null,
  body       text,
  source     text not null default 'chat' check (source in ('chat','manual')),
  void       boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists payouts_staff on public.payouts (staff_id, paid_on);
alter table public.payouts enable row level security;
drop policy if exists "owner_all" on public.payouts;
create policy "owner_all" on public.payouts for all to authenticated using (public.is_owner()) with check (public.is_owner());
grant select, insert, update, delete on public.payouts to authenticated;
grant usage, select on sequence public.payouts_id_seq to authenticated;
revoke all on public.payouts from anon;

-- "7 넣었어요" → 70000 / "9만원 입금" → 90000 / "75,000원 보냈어요" → 75000 / "7.5 넣었" → 75000
create or replace function public._pay_amount(p text) returns int language plpgsql immutable as $$
declare m text[]; n numeric; u text;
begin
  m := regexp_match(coalesce(p,''), '(\d[\d,]*(?:\.\d+)?)\s*(만\s*원|만|천\s*원|천|원)?\s*(?:을|를|이|정도)?\s*(?:넣었|넣어|넣음|입금|송금|보냈|보내드|이체|지급|쐈)');
  if m is null then return null; end if;
  n := replace(m[1], ',', '')::numeric; u := replace(coalesce(m[2], ''), ' ', '');
  if u in ('만','만원') then n := n * 10000;
  elsif u in ('천','천원') then n := n * 1000;
  elsif u = '' and n < 1000 then n := n * 10000;
  end if;
  if n <= 0 or n > 100000000 then return null; end if;
  return round(n)::int;
end $$;

create or replace function public._pay_from_chat() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare r public.chat_rooms; amt int;
begin
  if new.staff_id is not null then return new; end if;                      -- 대표·관리자 글만
  if new.admin_uid is not null and not exists (select 1 from public.admins a where a.user_id = new.admin_uid and a.role = 'owner') then return new; end if;
  select * into r from public.chat_rooms where id = new.room_id;
  if r.kind <> 'dm' or r.staff_id is null then return new; end if;          -- 1:1 방만
  if new.deleted_at is not null then
    update public.payouts set void = true where msg_id = new.id; return new;
  end if;
  amt := public._pay_amount(new.body);
  if amt is null then
    update public.payouts set void = true where msg_id = new.id; return new;
  end if;
  insert into public.payouts (staff_id, amount, paid_on, msg_id, body, source)
    values (r.staff_id, amt, (new.created_at at time zone 'Asia/Seoul')::date, new.id, new.body, 'chat')
    on conflict (msg_id) do update set amount = excluded.amount, body = excluded.body, void = false;
  return new;
end $$;
drop trigger if exists chat_pay on public.chat_messages;
create trigger chat_pay after insert or update of body, deleted_at on public.chat_messages
  for each row execute function public._pay_from_chat();

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 9 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v9)' as result;
