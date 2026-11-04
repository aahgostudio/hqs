-- ============================================================
--  어닝플레이스 HQ 업데이트 v42 (2026-11-05)
--  영업파트너 돈 잠금 — 수수료·입금 계좌는 서버에서도 대표님만
--  · partner_payouts : 대표만 읽기·쓰기 (관리자 X)
--  · 입금 계좌 → partner_private 표로 옮기고 대표만
--  · 계약 성사 → 수수료 회차는 서버가 자동으로 만듦 (관리자가 처리해도 생김)
-- ============================================================

-- 1) 입금 계좌: 대표만 보는 표로 옮기기
create table if not exists public.partner_private (
  partner_id  bigint primary key references public.partners(id) on delete cascade,
  bank        text,
  updated_at  timestamptz not null default now()
);
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema='public' and table_name='partners' and column_name='bank') then
    insert into public.partner_private(partner_id, bank)
      select id, bank from public.partners where bank is not null
      on conflict (partner_id) do update set bank = excluded.bank, updated_at = now();
    alter table public.partners drop column bank;
  end if;
end $$;
alter table public.partner_private enable row level security;
drop policy if exists "owner_all" on public.partner_private;
create policy "owner_all" on public.partner_private for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- 2) 수수료 표: 관리자 권한 빼고 대표만
drop policy if exists "admin_all" on public.partner_payouts;
drop policy if exists "owner_all" on public.partner_payouts;
create policy "owner_all" on public.partner_payouts for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- 3) 계약 성사·금액이 바뀌면 수수료 회차를 서버가 다시 계산 (입금 끝난 회차는 그대로)
create or replace function private.on_referral_pay() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare p public.partners; st date; fee int; i int;
begin
  if tg_op = 'UPDATE' and new.status is not distinct from old.status and new.amount is not distinct from old.amount
     and new.monthly is not distinct from old.monthly and new.recurring is not distinct from old.recurring
     and new.partner_id is not distinct from old.partner_id and new.won_at is not distinct from old.won_at then
    return new;
  end if;
  delete from public.partner_payouts where referral_id = new.id and paid_on is null;
  if new.status <> 'won' or new.partner_id is null then return new; end if;
  select * into p from public.partners where id = new.partner_id;
  if p.id is null then return new; end if;
  st := date_trunc('month', coalesce(new.won_at, current_date))::date;
  if new.recurring and coalesce(new.monthly,0) > 0 then
    fee := round(new.monthly * p.rate / 100);
    for i in 1..greatest(p.months,1) loop
      if not exists (select 1 from public.partner_payouts where referral_id = new.id and round = i) then
        insert into public.partner_payouts(referral_id, partner_id, round, rounds, base, fee, tax, pay, due_month)
        values (new.id, p.id, i, greatest(p.months,1), new.monthly, fee, floor(fee * 0.033 / 10) * 10, fee - floor(fee * 0.033 / 10) * 10,
                to_char(st + make_interval(months => i - 1), 'YYYY-MM'));
      end if;
    end loop;
  elsif coalesce(new.amount,0) > 0 and not exists (select 1 from public.partner_payouts where referral_id = new.id and round = 1) then
    fee := round(new.amount * p.rate / 100);
    insert into public.partner_payouts(referral_id, partner_id, round, rounds, base, fee, tax, pay, due_month)
    values (new.id, p.id, 1, 1, new.amount, fee, floor(fee * 0.033 / 10) * 10, fee - floor(fee * 0.033 / 10) * 10, to_char(st, 'YYYY-MM'));
  end if;
  return new;
end $$;
drop trigger if exists referral_pay on public.referrals;
create trigger referral_pay after insert or update on public.referrals for each row execute function private.on_referral_pay();

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(42, 0) $$;

select '업데이트 완료 (v42) · 수수료·계좌 대표만' as result;
