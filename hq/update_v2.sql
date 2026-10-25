-- ============================================================
--  어닝플레이스 HQ · HQS 2차 업데이트 (2026-10-25)
--  Supabase → SQL Editor → 통째로 붙여넣고 [Run]
--  여러 번 실행해도 안전해요 (있으면 건너뜀). 기존 데이터는 그대로예요.
-- ============================================================

-- ---------- 버전 표시 (화면이 새 기능을 켤지 판단) ----------
create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 2 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

-- ---------- 대표 / 관리자 구분 (돈 정보는 대표만) ----------
alter table public.admins add column if not exists role text not null default 'owner';
create or replace function public.is_owner() returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.admins where user_id = auth.uid() and role = 'owner');
$$;
grant execute on function public.is_owner() to authenticated;

-- ---------- 직원: 매물노트 코드 연결, 도급 지급 방식 ----------
alter table public.staff add column if not exists maemul_code text;
do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'staff_maemul_code_key') then
    create unique index staff_maemul_code_key on public.staff (maemul_code) where maemul_code is not null;
  end if;
end $$;
alter table public.staff drop constraint if exists staff_pay_type_check;
alter table public.staff add constraint staff_pay_type_check
  check (pay_type in ('none','freelance33','daily','salary','contract'));

-- ---------- 일정(현장): 접수 상태, 금액·증빙, 추가금, 홍보, 손님 링크 ----------
alter table public.jobs drop constraint if exists jobs_status_check;
alter table public.jobs add constraint jobs_status_check
  check (status in ('quote','open','full','done','cancelled'));   -- quote = 오더 접수·견적 중
alter table public.jobs
  add column if not exists deposit_how     text,                  -- 계좌이체·카드·플랫폼 …
  add column if not exists deposit_proof   text,                  -- 세금계산서·현금영수증·카드·없음
  add column if not exists deposit_issued  boolean not null default false,
  add column if not exists deposit_paid    boolean not null default false,
  add column if not exists balance_how     text,
  add column if not exists balance_proof   text,
  add column if not exists balance_issued  boolean not null default false,
  add column if not exists extras          jsonb   not null default '[]',   -- 추가금 [{name,amount,notice:'pre'|'site',agreed,how,proof,issued}]
  add column if not exists contract_mode   text,                  -- 도급 정산 A(예약금만 본사) / B(전액 받고 잔금 송금)
  add column if not exists quote           jsonb   not null default '{}',   -- 견적 체크리스트 {items:[..], base, note}
  add column if not exists cs              jsonb   not null default '{}',   -- {revisit, claim, photo_ok}
  add column if not exists promo           jsonb   not null default '{}',   -- {photo:1, blog:1, insta:0, dg:0, reels:-1}  (-1 = 해당 없음)
  add column if not exists promo_links     jsonb   not null default '[]',   -- [{ch, url, at}]
  add column if not exists live_code       text,
  add column if not exists live_title      text,
  add column if not exists live_views      int     not null default 0,
  add column if not exists live_close_days int     not null default 7,
  add column if not exists live_closed     boolean not null default false,  -- [지금 닫기]
  add column if not exists work_done_at    timestamptz,           -- 직원 [작업 끝]
  add column if not exists done_at         timestamptz;           -- 대표 마감
do $$ begin
  if not exists (select 1 from pg_indexes where indexname = 'jobs_live_code_key') then
    create unique index jobs_live_code_key on public.jobs (live_code) where live_code is not null;
  end if;
end $$;

create or replace function public.jobs_done_at() returns trigger language plpgsql as $$
begin
  if new.status = 'done' and new.done_at is null then new.done_at := now(); end if;
  return new;
end $$;
drop trigger if exists jobs_done_at on public.jobs;
create trigger jobs_done_at before insert or update on public.jobs
  for each row execute function public.jobs_done_at();

-- ---------- 새 표 ----------
-- 일할 수 있는 날 / 안 되는 날
create table if not exists public.availability (
  staff_id uuid not null references public.staff(id) on delete cascade,
  day      date not null,
  kind     text not null check (kind in ('ok','no')),
  memo     text,
  primary key (staff_id, day)
);

-- 개인 일정 (부동산 계약·잔금·안내, 대표 개인 일정 등). staff_id 가 비어 있으면 대표 일정
create table if not exists public.events (
  id         bigint generated always as identity primary key,
  staff_id   uuid references public.staff(id) on delete cascade,
  ev_date    date not null,
  ev_time    time,
  kind       text not null default '기타',     -- 계약·잔금·안내·회의·기타·개인
  biz        text not null default 'res',      -- res 부동산 / clean 청소 / ago 아고 / common 공통 / me 개인
  maemul_id  text,                             -- 매물번호 (예: 조-0005)
  title      text not null,                    -- 캘린더에 보일 말 (손님 이름·연락처 금지)
  memo       text,                             -- 나만 보기
  show_boss  boolean not null default true,    -- 대표 일정판에 보이기
  to_gcal    boolean not null default false,   -- 내 구글 캘린더 구독에 넣기
  created_at timestamptz not null default now()
);
create index if not exists events_date on public.events (ev_date);

-- 현장 사진 (손님 링크 · HQS 사진함 · 홍보)
create table if not exists public.job_photos (
  id         bigint generated always as identity primary key,
  job_id     bigint not null references public.jobs(id) on delete cascade,
  staff_id   uuid references public.staff(id) on delete set null,
  path       text not null,                    -- live 버킷 경로
  stage      text not null default 'during' check (stage in ('before','during','after')),
  memo       text,
  hidden     boolean not null default false,   -- 손님 화면에서 숨기기
  created_at timestamptz not null default now()
);
create index if not exists job_photos_job on public.job_photos (job_id);

-- 부동산 계약 중개보수
create table if not exists public.deals (
  id         bigint generated always as identity primary key,
  deal_date  date not null,
  maemul_id  text,
  title      text not null,
  deal_kind  text,                             -- 월세·전세·매매·기타
  sides      jsonb not null default '[]',      -- [{side:'임대인', amount, how, proof, issued, paid}]
  agents     uuid[] not null default '{}',     -- 담당 (공동중개면 여러 명)
  memo       text,
  created_at timestamptz not null default now()
);

-- 직원별 배분율 · 계약별 배분 (대표만)
create table if not exists public.pay_rules (
  staff_id   uuid primary key references public.staff(id) on delete cascade,
  share_rate numeric                          -- 부동산 기본 배분율 %
);
create table if not exists public.deal_shares (
  deal_id  bigint not null references public.deals(id) on delete cascade,
  staff_id uuid   not null references public.staff(id) on delete cascade,
  contrib  numeric not null default 100,      -- 공동중개 기여 %
  rate     numeric,                           -- 이 계약만 다른 배분율 % (비우면 기본값)
  paid     boolean not null default false,
  primary key (deal_id, staff_id)
);

-- 운영비 (광고비·비품비 …)
create table if not exists public.expenses (
  id          bigint generated always as identity primary key,
  ex_date     date not null,
  biz         text not null default 'common',  -- clean / res / common / ago
  category    text not null,
  memo        text,
  amount      int  not null,
  account     text,                            -- 결제 구좌: 사업용 카드 · 사업자 통장 · 현금 …
  has_receipt boolean not null default false,
  created_at  timestamptz not null default now()
);

-- 외주 · 도급 지급 (매입 자료)
create table if not exists public.purchases (
  id           bigint generated always as identity primary key,
  pu_date      date not null,
  job_id       bigint references public.jobs(id) on delete set null,
  biz          text not null default 'clean',
  category     text not null,                  -- 청소 도급 · 철거 · 시설관리 · 폐기물 처리 · 장비 임대 · 자재 · 기타
  vendor       text,
  amount       int  not null,
  proof        text,                           -- 세금계산서 · 현금영수증(지출증빙) · 카드 · 원천징수(3.3%) · 없음
  proof_status text not null default '요청함' check (proof_status in ('받음','요청함','없음')),
  pay_how      text,
  memo         text,
  created_at   timestamptz not null default now()
);

-- ---------- 보안 ----------
do $$
declare t text;
begin
  foreach t in array array['availability','events','job_photos','deals','expenses','purchases'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "admin_all" on public.%I', t);
    execute format('create policy "admin_all" on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
  foreach t in array array['pay_rules','deal_shares'] loop     -- 대표만
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner_all" on public.%I', t);
    execute format('create policy "owner_all" on public.%I for all to authenticated using (public.is_owner()) with check (public.is_owner())', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
grant usage on all sequences in schema public to authenticated;

-- ---------- 기본 설정값 (없을 때만) ----------
insert into public.settings (key, value) values
  ('boss_status', '{"state":"근무중","memo":"","until":null}'),
  ('promo_links', '[{"name":"네이버 블로그","url":"https://blog.naver.com/","sub":"글쓰기"},{"name":"인스타그램","url":"https://www.instagram.com/ritzcleanworks","sub":"@ritzcleanworks"},{"name":"당근 비즈프로필","url":"https://www.daangn.com/","sub":"소식 쓰기"},{"name":"스마트플레이스","url":"https://new.smartplace.naver.com/","sub":"새소식 · 리뷰"},{"name":"숨고","url":"https://soomgo.com/","sub":"견적 요청함"},{"name":"사진 폴더","url":"https://drive.google.com/","sub":"작업사례"}]'),
  ('live', '{"auto_issue":true,"close_days":7,"review_url":"","phone":"010-7193-2246","bank":"카카오뱅크","account":"3333-2874-00563","holder":"권성환","show_staff":false,"intro_imgs":["/live/img/service.jpg","/live/img/options.jpg"],"done_img":"/live/img/account.jpg","bye_img":"/live/img/bye.jpg","kakao":""}'),
  ('extra_options', '[{"g":"에어컨 분해 청소","n":"벽걸이","p":"8만원","v":80000},{"g":"에어컨 분해 청소","n":"시스템 1~2way","p":"9만원","v":90000},{"g":"에어컨 분해 청소","n":"시스템 4way","p":"13만원","v":130000},{"g":"에어컨 분해 청소","n":"2in1 (스탠드+벽걸이)","p":"18~20만원","v":180000},{"g":"주방 · 가전","n":"후드 스팀 살균","p":"3만원~","v":30000},{"g":"주방 · 가전","n":"기름때 제거 (많을 때)","p":"3만원~","v":30000},{"g":"주방 · 가전","n":"빌트인 오븐 / 식세기","p":"각 2만원","v":20000},{"g":"주방 · 가전","n":"빌트인 냉장고","p":"2~5만원","v":20000},{"g":"새집증후군 · 위생","n":"새집증후군 (단독)","p":"평당 12,000원","v":0},{"g":"새집증후군 · 위생","n":"새집증후군 (청소와 함께)","p":"평당 10,000원","v":0},{"g":"새집증후군 · 위생","n":"하수구 소독","p":"3~5만원","v":30000},{"g":"곰팡이","n":"곰팡이 제거 (많을 때)","p":"3~10만원","v":30000},{"g":"곰팡이","n":"곰팡이 방지 작업","p":"3~10만원","v":30000},{"g":"반려동물 · 냄새","n":"반려동물 털 청소","p":"5만원~","v":50000},{"g":"반려동물 · 냄새","n":"반려동물 냄새 제거","p":"5만원~","v":50000},{"g":"반려동물 · 냄새","n":"털 + 냄새 세트","p":"8만원~","v":80000},{"g":"반려동물 · 냄새","n":"담배 냄새 · 니코틴","p":"5만원~","v":50000},{"g":"공간 케어","n":"스티커 · 시트지 (많을 때)","p":"3~10만원","v":30000},{"g":"공간 케어","n":"비확장 베란다","p":"3~5만원","v":30000},{"g":"공간 케어","n":"야외 테라스","p":"3만원","v":30000},{"g":"공간 케어","n":"방충망 고압세척","p":"장당 15,000원","v":15000}]'),
  ('ics_key', to_jsonb(encode(gen_random_bytes(12),'hex')))
on conflict (key) do nothing;

-- ---------- 손님 링크 사진 저장소 (공개 버킷, 추측 불가 경로) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('live', 'live', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

create or replace function public.live_upload_ok(p_code text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.jobs where live_code = p_code and not live_closed and status <> 'cancelled')
$$;
grant execute on function public.live_upload_ok(text) to anon, authenticated;

drop policy if exists "live_upload" on storage.objects;
create policy "live_upload" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'live' and public.live_upload_ok((storage.foldername(name))[1]));
drop policy if exists "live_admin_delete" on storage.objects;
create policy "live_admin_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'live' and public.is_admin());

-- ============================================================
--  직원용 함수 (개인 링크 · 매물노트 링크 둘 다 사용 가능)
-- ============================================================
create or replace function public._me(p_token text) returns public.staff
language plpgsql stable security definer set search_path = public, extensions as $$
declare s public.staff;
begin
  select * into s from public.staff
   where (token = p_token or (maemul_code is not null and maemul_code = p_token)) and status <> 'left';
  if not found then raise exception 'invalid_link' using errcode = '28000'; end if;
  return s;
end $$;
revoke all on function public._me(text) from public, anon, authenticated;

create or replace function public.token_valid(p_token text) returns boolean
language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from public.staff where (token = p_token or maemul_code = p_token) and status <> 'left')
$$;

-- 대표 상태 (정한 시간이 지나면 자동으로 근무중)
create or replace function public.boss_status() returns jsonb
language sql stable security definer set search_path = public, extensions as $$
  select case
    when v ? 'until' and nullif(v->>'until','') is not null and (v->>'until')::timestamptz < now()
      then jsonb_build_object('state','근무중','memo','','until',null)
    else v end
  from (select coalesce((select value from public.settings where key = 'boss_status'), '{"state":"근무중"}'::jsonb) v) x
$$;
grant execute on function public.boss_status() to anon, authenticated;

-- 일정판 전체 (v2)
create or replace function public.staff_board(p_token text, p_from date, p_to date)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  s public.staff := public._me(p_token);
  out jsonb;
begin
  update public.staff set last_seen_at = now() where id = s.id;
  update public.assignments a set seen_at = now()
    from public.jobs j
   where a.job_id = j.id and a.staff_id = s.id and a.status = 'approved'
     and j.job_date between p_from and p_to;

  select jsonb_build_object(
    'v', 2,
    'me', jsonb_build_object(
        'id', s.id, 'name', s.name, 'team', s.team,
        'team_name', (select name from public.teams where code = s.team),
        'role', s.role, 'can_collect', s.can_collect, 'pay_type', s.pay_type),
    'today', public._today(),
    'boss', public.boss_status(),
    'jobs', coalesce((
      select jsonb_agg(x order by x->>'date', x->>'time') from (
        select jsonb_build_object(
          'id', j.id,
          'date', j.job_date,
          'time', to_char(j.start_time, 'HH24:MI'),
          'title', j.title,
          'kind', j.kind,
          'headcount', j.headcount,
          'public_note', j.public_note,
          'status', j.status,
          'team', j.teams[1],
          'approved', (select count(*) from public.assignments a where a.job_id = j.id and a.status = 'approved'),
          'crew', coalesce((select jsonb_agg(st.name order by a.decided_at)
                     from public.assignments a join public.staff st on st.id = a.staff_id
                    where a.job_id = j.id and a.status = 'approved'), '[]'::jsonb),
          'my_status', my.status,
          'address',      case when my.status = 'approved' then j.address end,
          'private_note', case when my.status = 'approved' then j.private_note end,
          'need_ack',     (my.status = 'approved' and (my.ack_at is null or my.ack_at < j.changed_at)
                           and my.decided_at is not null and j.changed_at > my.decided_at),
          'collector',    (j.collector_id = s.id),
          'balance',      case when j.collector_id = s.id then j.balance_amount end,
          'collected_at', case when j.collector_id = s.id then j.collected_at end,
          'my_pay',       case when my.status = 'approved' and j.status = 'done'
                               then coalesce(my.pay_amount,0) + coalesce(my.extra_amount,0) end,
          -- 현장 사진 (확정자만)
          'live',         case when my.status = 'approved' then j.live_code end,
          'photos',       case when my.status = 'approved' then (select count(*) from public.job_photos p where p.job_id = j.id) end,
          'work_done',    case when my.status = 'approved' then j.work_done_at end
        ) as x
        from public.jobs j
        left join public.assignments my on my.job_id = j.id and my.staff_id = s.id
        where j.job_date between p_from and p_to and j.status <> 'quote'
          and (
            (public._can_see(j, s) and j.status <> 'cancelled')
            or my.status in ('applied','approved')
          )
      ) q), '[]'::jsonb),
    'avail', coalesce((select jsonb_object_agg(a.day, a.kind) from public.availability a
                        where a.staff_id = s.id and a.day between p_from and p_to), '{}'::jsonb),
    'events', coalesce((select jsonb_agg(jsonb_build_object(
          'id', e.id, 'date', e.ev_date, 'time', to_char(e.ev_time,'HH24:MI'), 'kind', e.kind,
          'maemul', e.maemul_id, 'title', e.title, 'memo', e.memo, 'show_boss', e.show_boss, 'gcal', e.to_gcal)
          order by e.ev_date, e.ev_time)
        from public.events e where e.staff_id = s.id and e.ev_date between p_from and p_to), '[]'::jsonb),
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object(
          'id', n.id, 'title', n.title, 'body', n.body, 'important', n.important,
          'team', n.team, 'at', n.created_at,
          'read', r.read_at is not null, 'confirmed', r.confirmed_at is not null)
        order by n.created_at desc)
        from public.notices n
        left join public.notice_reads r on r.notice_id = n.id and r.staff_id = s.id
       where (n.team is null or n.team = s.team
              or (n.team = 'OPS' and s.team in ('SPT','PRT')))          -- 청소 공지 = 직영·지원·도급
         and n.created_at > now() - interval '60 days'), '[]'::jsonb)
  ) into out;
  return out;
end $$;

-- 일할 수 있는 날 / 안 되는 날 (kind: ok · no · clear)
create or replace function public.staff_set_avail(p_token text, p_days date[], p_kind text, p_memo text default null)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  if p_kind = 'clear' then
    delete from public.availability where staff_id = s.id and day = any(p_days);
  elsif p_kind in ('ok','no') then
    insert into public.availability (staff_id, day, kind, memo)
    select s.id, d, p_kind, p_memo from unnest(p_days) d where d >= public._today() - 1
    on conflict (staff_id, day) do update set kind = excluded.kind, memo = coalesce(excluded.memo, public.availability.memo);
  else raise exception 'bad_kind'; end if;
  return 'ok';
end $$;

-- 개인 일정 저장 / 삭제
create or replace function public.staff_event_save(p_token text, p_id bigint, p_date date, p_time time, p_kind text,
  p_maemul text, p_title text, p_memo text, p_show_boss boolean, p_gcal boolean)
returns bigint language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); rid bigint;
begin
  if coalesce(trim(p_title),'') = '' then raise exception 'empty'; end if;
  if p_id is null then
    insert into public.events (staff_id, ev_date, ev_time, kind, biz, maemul_id, title, memo, show_boss, to_gcal)
    values (s.id, p_date, p_time, coalesce(p_kind,'기타'),
            case when s.team = 'RES' then 'res' else 'clean' end,
            nullif(trim(p_maemul),''), left(trim(p_title),80), nullif(left(p_memo,500),''), coalesce(p_show_boss,true), coalesce(p_gcal,false))
    returning id into rid;
  else
    update public.events set ev_date = p_date, ev_time = p_time, kind = coalesce(p_kind,'기타'),
      maemul_id = nullif(trim(p_maemul),''), title = left(trim(p_title),80), memo = nullif(left(p_memo,500),''),
      show_boss = coalesce(p_show_boss,true), to_gcal = coalesce(p_gcal,false)
     where id = p_id and staff_id = s.id returning id into rid;
    if rid is null then raise exception 'not_allowed'; end if;
  end if;
  return rid;
end $$;

create or replace function public.staff_event_delete(p_token text, p_id bigint)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  delete from public.events where id = p_id and staff_id = s.id;
  return 'ok';
end $$;

-- 손님 링크 코드 만들기 (없으면)
create or replace function public._live_code() returns text language sql volatile set search_path = public, extensions as $$
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + (get_byte(b, i) % 32), 1), '')
    from (select gen_random_bytes(8) b) x, generate_series(0,7) i
$$;
create or replace function public._ensure_live(p_job bigint) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare c text;
begin
  select live_code into c from public.jobs where id = p_job;
  if c is null then
    loop
      c := public._live_code();
      begin
        update public.jobs set live_code = c where id = p_job and live_code is null;
        exit;
      exception when unique_violation then null;
      end;
    end loop;
    select live_code into c from public.jobs where id = p_job;
  end if;
  return c;
end $$;
revoke all on function public._ensure_live(bigint), public._live_code() from public, anon, authenticated;

-- 사진 올릴 곳 (확정자만) → 손님 링크 코드
create or replace function public.staff_live_target(p_token text, p_job bigint)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  if not exists (select 1 from public.assignments where job_id = p_job and staff_id = s.id and status = 'approved') then
    raise exception 'not_allowed';
  end if;
  return public._ensure_live(p_job);
end $$;

-- 현장 사진 등록 → 손님 링크 · HQS 사진함 · 홍보 '사진 받음'
create or replace function public.staff_job_photo(p_token text, p_job bigint, p_paths text[], p_stage text, p_memo text)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token); c text; n int;
begin
  if not exists (select 1 from public.assignments where job_id = p_job and staff_id = s.id and status = 'approved') then
    raise exception 'not_allowed';
  end if;
  c := public._ensure_live(p_job);
  if exists (select 1 from unnest(coalesce(p_paths,'{}')) p where p not like c || '/%') then raise exception 'bad_photo'; end if;
  insert into public.job_photos (job_id, staff_id, path, stage, memo)
  select p_job, s.id, p, case when p_stage in ('before','during','after') then p_stage else 'during' end, nullif(left(p_memo,200),'')
    from unnest(p_paths) p;
  get diagnostics n = row_count;
  update public.jobs set promo = jsonb_set(promo, '{photo}', '1') where id = p_job;
  return n;
end $$;

-- 직원 [작업 끝] → 손님 화면이 완료 리포트로
create or replace function public.staff_work_done(p_token text, p_job bigint)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  if not exists (select 1 from public.assignments where job_id = p_job and staff_id = s.id and status = 'approved') then
    raise exception 'not_allowed';
  end if;
  update public.jobs set work_done_at = coalesce(work_done_at, now()) where id = p_job;
  return 'ok';
end $$;

-- 내 정산 (v2: 지급 방식 포함)
create or replace function public.staff_pay(p_token text, p_month date)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  return jsonb_build_object('pay_type', s.pay_type, 'items', coalesce((
    select jsonb_agg(jsonb_build_object(
      'date', j.job_date, 'title', j.title,
      'base', coalesce(a.pay_amount,0), 'extra', coalesce(a.extra_amount,0),
      'amount', coalesce(a.pay_amount,0) + coalesce(a.extra_amount,0),
      'memo', a.pay_memo, 'paid', a.paid) order by j.job_date)
    from public.assignments a join public.jobs j on j.id = a.job_id
   where a.staff_id = s.id and a.status = 'approved' and j.status = 'done'
     and date_trunc('month', j.job_date) = date_trunc('month', p_month)), '[]'::jsonb));
end $$;

-- ============================================================
--  손님 실시간 사진 페이지 (로그인 없음, 코드로만)
-- ============================================================
create or replace function public.live_view(p_code text, p_count boolean default false)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare j public.jobs; cfg jsonb; st text; close_at timestamptz; extra int; bal int;
begin
  select * into j from public.jobs where live_code = p_code and status <> 'cancelled';
  if not found or length(coalesce(p_code,'')) < 6 then raise exception 'not_found'; end if;
  cfg := coalesce((select value from public.settings where key = 'live'), '{}'::jsonb);
  close_at := coalesce(j.work_done_at, j.done_at) + make_interval(days => j.live_close_days);
  st := case when j.live_closed or (close_at is not null and close_at < now()) then 'closed'
             when j.work_done_at is not null or j.status = 'done' then 'done'
             else 'live' end;
  if p_count then update public.jobs set live_views = live_views + 1 where id = j.id; end if;
  select coalesce(sum((e->>'amount')::int),0) into extra
    from jsonb_array_elements(j.extras) e where coalesce((e->>'agreed')::boolean, true);
  bal := case when j.balance_amount is null then null else j.balance_amount + extra end;
  return jsonb_build_object(
    'state', st,
    'title', coalesce(nullif(j.live_title,''), j.title),
    'kind', j.kind,
    'date', j.job_date,
    'time', to_char(j.start_time,'HH24:MI'),
    'done_at', coalesce(j.work_done_at, j.done_at),
    'close_at', close_at,
    'cfg', cfg - 'show_staff',
    'crew', case when coalesce((cfg->>'show_staff')::boolean,false) then
              (select jsonb_agg(st2.name) from public.assignments a join public.staff st2 on st2.id = a.staff_id
                where a.job_id = j.id and a.status = 'approved') end,
    'extras', case when st <> 'live' then (select coalesce(jsonb_agg(jsonb_build_object('name', e->>'name', 'amount', (e->>'amount')::int)),'[]'::jsonb)
                from jsonb_array_elements(j.extras) e where coalesce((e->>'agreed')::boolean, true)) end,
    'balance', case when st = 'done' then j.balance_amount end,
    'pay_total', case when st = 'done' then bal end,
    'paid', (j.collected_at is not null),
    'photos', case when st = 'closed' then '[]'::jsonb else coalesce((
        select jsonb_agg(jsonb_build_object('path', p.path, 'stage', p.stage, 'memo', p.memo, 'at', p.created_at) order by p.created_at desc)
          from public.job_photos p where p.job_id = j.id and not p.hidden), '[]'::jsonb) end
  );
end $$;
grant execute on function public.live_view(text, boolean) to anon, authenticated;

-- ============================================================
--  구글 캘린더 구독용 (매물노트 서버가 ICS로 바꿔줌)
-- ============================================================
create or replace function public.staff_ics(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  return jsonb_build_object('name', s.name, 'items', coalesce((
    select jsonb_agg(x) from (
      select jsonb_build_object('uid', 'job-'||j.id, 'date', j.job_date, 'time', to_char(j.start_time,'HH24:MI'),
             'title', '[현장] '||j.title, 'dur', 240) x
        from public.assignments a join public.jobs j on j.id = a.job_id
       where a.staff_id = s.id and a.status = 'approved' and j.status <> 'cancelled'
         and j.job_date between public._today() - 30 and public._today() + 120
      union all
      select jsonb_build_object('uid', 'ev-'||e.id, 'date', e.ev_date, 'time', to_char(e.ev_time,'HH24:MI'),
             'title', '['||e.kind||'] '||e.title||coalesce(' · '||e.maemul_id,''), 'dur', 60)
        from public.events e where e.staff_id = s.id and e.to_gcal
         and e.ev_date between public._today() - 30 and public._today() + 120
    ) q), '[]'::jsonb));
end $$;

create or replace function public.boss_ics(p_key text)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if p_key is null or p_key is distinct from (select value #>> '{}' from public.settings where key = 'ics_key') then
    raise exception 'not_allowed';
  end if;
  return jsonb_build_object('name', '리츠부동산 직원 일정', 'items', coalesce((
    select jsonb_agg(jsonb_build_object('uid', 'ev-'||e.id, 'date', e.ev_date, 'time', to_char(e.ev_time,'HH24:MI'),
           'title', st.name||' · '||e.kind||' '||coalesce(e.maemul_id||' ','')||e.title, 'dur', 60))
      from public.events e join public.staff st on st.id = e.staff_id
     where e.show_boss and st.team = 'RES' and e.ev_date between public._today() - 30 and public._today() + 120), '[]'::jsonb));
end $$;

grant execute on function
  public.token_valid(text),
  public.staff_board(text, date, date),
  public.staff_set_avail(text, date[], text, text),
  public.staff_event_save(text, bigint, date, time, text, text, text, text, boolean, boolean),
  public.staff_event_delete(text, bigint),
  public.staff_live_target(text, bigint),
  public.staff_job_photo(text, bigint, text[], text, text),
  public.staff_work_done(text, bigint),
  public.staff_pay(text, date),
  public.staff_ics(text),
  public.boss_ics(text)
to anon, authenticated;

-- 끝. 화면 맨 위에 '업데이트 완료'가 보이면 성공이에요.
select '업데이트 완료 (v2)' as result;
