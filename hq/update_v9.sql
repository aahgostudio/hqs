-- ============================================================
--  어닝플레이스 HQ 업데이트 v9 (2026-10-27)  ※ v8 포함 — 이것 하나만 돌리면 돼요
--  ① 인사카드 대표 전용 칸 (주민번호·계좌 서버 자동 암호화, 비밀번호 없음)
--  ③ 직원 화면 '내 돈': 번 돈 · 받은 돈 · 아직 안 받은 돈 (11/1부터)
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

-- ---------- 직원 화면: 내 돈 (번 돈 · 받은 돈 · 아직 안 받은 돈) ----------
--  11/1 이후 일만 계산 (그 전은 카카오워크 시절 정산 끝난 것으로 봄) · settings 'pay_track_from' 으로 바꿀 수 있음
insert into public.settings (key, value) values ('pay_track_from', '"2026-11-01"'::jsonb) on conflict (key) do nothing;

create or replace function public._deduct(p_type text, p_amount numeric, p_days int default 1) returns int language plpgsql immutable as $$
declare per numeric; t numeric;
begin
  if p_type = 'freelance33' then return (floor(p_amount * 0.033 / 10) * 10)::int; end if;
  if p_type = 'daily' then
    per := p_amount / greatest(p_days, 1); t := greatest(0, per - 150000) * 0.06 * 0.45 * 1.1;
    t := floor(t * greatest(p_days, 1) / 10) * 10; if t < 1000 * greatest(p_days, 1) then return 0; end if; return t::int;
  end if;
  return 0;
end $$;

create or replace function public.staff_money(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); since date; m date; out jsonb := '[]'::jsonb;
        g numeric; n int; d int; rcv int; tot_net bigint := 0; tot_rcv bigint := 0; base_rate numeric;
begin
  since := coalesce((select (value #>> '{}')::date from public.settings where key = 'pay_track_from'), date '2026-11-01');
  base_rate := (select share_rate from public.pay_rules where staff_id = s.id);
  for i in 0..5 loop
    m := (date_trunc('month', public._today()) - make_interval(months => i))::date;
    if s.team = 'RES' then
      select coalesce(sum(round(
               (select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(dl.sides) x)
               * coalesce(sh.contrib, 100.0 / greatest(array_length(dl.agents, 1), 1)) / 100
               * coalesce(sh.rate, base_rate, 0) / 100)), 0), count(*)
        into g, n
        from public.deals dl left join public.deal_shares sh on sh.deal_id = dl.id and sh.staff_id = s.id
       where s.id = any(dl.agents) and dl.deal_date >= greatest(m, since) and dl.deal_date < (m + interval '1 month');
    else
      select coalesce(sum(coalesce(a.pay_amount,0) + coalesce(a.extra_amount,0)), 0), count(*)
        into g, n
        from public.assignments a join public.jobs j on j.id = a.job_id
       where a.staff_id = s.id and a.status = 'approved' and j.status = 'done'
         and j.job_date >= greatest(m, since) and j.job_date < (m + interval '1 month');
    end if;
    d := case when s.pay_type = 'salary' then 0 else public._deduct(s.pay_type, g, n) end;
    select coalesce(sum(amount), 0) into rcv from public.payouts
     where staff_id = s.id and not void and paid_on >= greatest(m, since) and paid_on < (m + interval '1 month');
    out := out || jsonb_build_array(jsonb_build_object('ym', to_char(m, 'YYYY-MM'), 'n', n, 'gross', g, 'ded', d, 'net', g - d, 'received', rcv));
    if m + interval '1 month' > since then tot_net := tot_net + (g - d); tot_rcv := tot_rcv + rcv; end if;
  end loop;
  return jsonb_build_object('team', s.team, 'pay_type', s.pay_type, 'since', since, 'months', out,
    'net_all', tot_net, 'received_all', tot_rcv, 'due', tot_net - tot_rcv,
    'payday', case when s.team = 'RES' then '매달 말일 정산 → 다음 달 10일 지급' else '현장 마감·수금 확인 후 저녁 지급' end,
    'recent', coalesce((select jsonb_agg(jsonb_build_object('date', paid_on, 'amount', amount) order by paid_on desc, id desc)
                          from (select * from public.payouts where staff_id = s.id and not void and paid_on >= since order by paid_on desc, id desc limit 10) p), '[]'::jsonb));
end $$;
grant execute on function public.staff_money(text) to anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 9 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v9)' as result;
