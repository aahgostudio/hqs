-- ============================================================
--  어닝플레이스 HQ 업데이트 v40 (2026-11-04)
--  영업파트너 — 파트너 명부 · 소개 접수 · 수수료 정산
--  · 파트너 개인 화면: team.earningplace.kr/partner/?k=개인토큰
--  · 고객용 소개 링크: team.earningplace.kr/r/?c=소개코드
--  · HQ '운영' 탭 → '영업파트너' 탭 (채널·견적은 옆에 작게)
-- ============================================================

-- 1) 파트너 명부
create table if not exists public.partners (
  id          bigint generated always as identity primary key,
  name        text not null,
  phone       text,
  kind        text not null default 'refer' check (kind in ('refer','sales')),   -- refer = 소개형(N잡) / sales = 전담 영업
  job         text,                                   -- 직장인 · 공인중개사 · 인테리어 · 주부 …
  status      text not null default 'active' check (status in ('active','sleep','end')),  -- 활동 / 휴면 / 계약종료
  token       text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  ref_code    text unique,                            -- 고객용 소개 링크 코드 (짧게)
  rate        numeric not null default 10,            -- 수수료 % (기본 10)
  months      int not null default 3,                 -- 정기청소 수수료 개월 수 (기본 3)
  signed      boolean not null default false,         -- 파트너 계약서 서명
  bank        text,                                   -- 입금 계좌 (대표만 봄)
  memo        text,
  created_at  timestamptz not null default now()
);

-- 2) 소개 접수
create table if not exists public.referrals (
  id          bigint generated always as identity primary key,
  partner_id  bigint references public.partners(id) on delete set null,
  customer    text not null,                          -- 업체명 또는 고객 이름
  phone       text,
  area        text,
  kind        text,                                   -- 준공·인테리어 후 / 상가·사무실 정기 / 입주·이사 / 외국계 / 기타
  memo        text,
  consent     boolean not null default false,         -- 고객 연락 동의
  source      text not null default 'partner' check (source in ('partner','link','hq')),
  status      text not null default 'new' check (status in ('new','contact','won','lost')),
  note        text,                                   -- 파트너에게 보이는 리츠 메모
  lost_reason text,
  job_id      bigint references public.jobs(id) on delete set null,
  amount      int,                                    -- 계약금액 (1회)
  recurring   boolean not null default false,         -- 정기청소
  monthly     int,                                    -- 정기 월 금액
  dup_of      bigint references public.referrals(id) on delete set null,   -- 같은 연락처를 먼저 소개한 건
  won_at      date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists referrals_partner_idx on public.referrals(partner_id);
create index if not exists referrals_phone_idx on public.referrals(regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g'));

-- 3) 수수료 (회차별 한 줄)
create table if not exists public.partner_payouts (
  id          bigint generated always as identity primary key,
  referral_id bigint not null references public.referrals(id) on delete cascade,
  partner_id  bigint references public.partners(id) on delete set null,
  round       int not null default 1,                 -- 정기 1/3, 2/3, 3/3
  rounds      int not null default 1,
  base        int not null default 0,                 -- 계약금액(또는 월 금액)
  fee         int not null default 0,                 -- 수수료
  tax         int not null default 0,                 -- 3.3%
  pay         int not null default 0,                 -- 보낼 돈
  due_month   text not null,                          -- 'YYYY-MM'
  paid_on     date,
  created_at  timestamptz not null default now(),
  unique (referral_id, round)
);

-- RLS: 관리자만 직접 접근 (파트너·고객은 아래 토큰 함수로만)
do $$ declare t text; begin
  foreach t in array array['partners','referrals','partner_payouts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin_all" on public.%I', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- 같은 연락처 먼저 소개된 건 찾기 (최근 180일, 불발 제외)
create or replace function public._ref_dup(p_phone text, p_self bigint default null) returns bigint
language sql stable security definer set search_path = public as $$
  select r.id from public.referrals r
   where length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) >= 9
     and regexp_replace(coalesce(r.phone,''), '[^0-9]', '', 'g') = regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')
     and r.status <> 'lost' and r.created_at > now() - interval '180 days'
     and (p_self is null or r.id <> p_self)
   order by r.created_at limit 1
$$;

-- 소개 들어오면 중복 표시 자동
create or replace function private.on_referral_ins() returns trigger
language plpgsql security definer set search_path = public, private as $$
begin
  if new.dup_of is null then new.dup_of := public._ref_dup(new.phone, null); end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists referral_ins on public.referrals;
create trigger referral_ins before insert on public.referrals for each row execute function private.on_referral_ins();

-- ---------- 파트너 개인 화면 (토큰) ----------
create or replace function public._partner(p_token text) returns public.partners
language plpgsql stable security definer set search_path = public as $$
declare p public.partners;
begin
  select * into p from public.partners where token = p_token and status <> 'end';
  if p.id is null then raise exception 'bad_token'; end if;
  return p;
end $$;

create or replace function public.partner_me(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p public.partners := public._partner(p_token);
begin
  return jsonb_build_object(
    'me', jsonb_build_object('name', p.name, 'kind', p.kind, 'ref_code', p.ref_code, 'rate', p.rate, 'months', p.months, 'signed', p.signed),
    'refs', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'customer', r.customer, 'area', r.area, 'kind', r.kind, 'status', r.status, 'note', r.note,
        'lost_reason', r.lost_reason, 'source', r.source, 'recurring', r.recurring,
        'amount', r.amount, 'monthly', r.monthly, 'dup', (r.dup_of is not null), 'created_at', r.created_at) order by r.created_at desc)
      from public.referrals r where r.partner_id = p.id), '[]'::jsonb),
    'pays', coalesce((select jsonb_agg(jsonb_build_object(
        'id', x.id, 'customer', r.customer, 'round', x.round, 'rounds', x.rounds, 'base', x.base, 'fee', x.fee,
        'tax', x.tax, 'pay', x.pay, 'due_month', x.due_month, 'paid_on', x.paid_on) order by x.due_month desc, x.id desc)
      from public.partner_payouts x join public.referrals r on r.id = x.referral_id where x.partner_id = p.id), '[]'::jsonb),
    'notice', (select value from public.settings where key = 'partner_notice')
  );
end $$;

create or replace function public.partner_refer(p_token text, p_customer text, p_phone text, p_area text, p_kind text, p_memo text, p_consent boolean)
returns text language plpgsql security definer set search_path = public as $$
declare p public.partners := public._partner(p_token); d bigint;
begin
  if coalesce(trim(p_customer),'') = '' then raise exception '업체명이나 고객 이름을 적어주세요'; end if;
  if not coalesce(p_consent,false) then raise exception '고객님 연락 동의를 체크해 주세요'; end if;
  d := public._ref_dup(p_phone, null);
  insert into public.referrals(partner_id, customer, phone, area, kind, memo, consent, source, dup_of)
  values (p.id, left(trim(p_customer),80), left(p_phone,30), left(p_area,80), left(p_kind,40), left(p_memo,500), true, 'partner', d);
  return case when d is null then 'ok' else 'dup' end;
end $$;

-- ---------- 고객용 소개 링크 (/r/?c=코드) ----------
create or replace function public.ref_link_info(p_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ok', true) from public.partners where ref_code = p_code and status = 'active'
$$;
create or replace function public.ref_link_submit(p_code text, p_customer text, p_phone text, p_area text, p_kind text, p_memo text, p_consent boolean)
returns text language plpgsql security definer set search_path = public as $$
declare p public.partners;
begin
  select * into p from public.partners where ref_code = p_code and status = 'active';
  if p.id is null then raise exception '링크가 맞지 않아요'; end if;
  if coalesce(trim(p_customer),'') = '' or length(regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')) < 9 then raise exception '이름과 연락처를 적어주세요'; end if;
  if not coalesce(p_consent,false) then raise exception '개인정보 수집·이용에 동의해 주세요'; end if;
  -- 같은 번호로 하루 3번 넘게 못 넣게 (장난 방지)
  if (select count(*) from public.referrals where source = 'link' and regexp_replace(coalesce(phone,''), '[^0-9]', '', 'g') = regexp_replace(p_phone, '[^0-9]', '', 'g') and created_at > now() - interval '1 day') >= 3 then
    raise exception '이미 접수됐어요. 곧 연락드릴게요'; end if;
  insert into public.referrals(partner_id, customer, phone, area, kind, memo, consent, source)
  values (p.id, left(trim(p_customer),80), left(p_phone,30), left(p_area,80), left(p_kind,40), left(p_memo,500), true, 'link');
  return 'ok';
end $$;

grant execute on function public.partner_me(text) to anon, authenticated;
grant execute on function public.partner_refer(text,text,text,text,text,text,boolean) to anon, authenticated;
grant execute on function public.ref_link_info(text) to anon, authenticated;
grant execute on function public.ref_link_submit(text,text,text,text,text,text,boolean) to anon, authenticated;
revoke execute on function public._partner(text) from anon, authenticated;
revoke execute on function public._ref_dup(text,bigint) from anon, authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(40, 0) $$;

select '업데이트 완료 (v40) · 영업파트너' as result;
