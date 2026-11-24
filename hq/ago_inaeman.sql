-- ============================================================
--  이내만 → 어닝플레이스 HQ 현황판 연결 (2026-11-24)
--  · HQ(아고스튜디오 탭)가 '숫자만' 가져가는 함수 hq_stats
--  · 이름·연락처·작품 같은 개인정보는 절대 안 나감 (합계 숫자만)
--  · 연결 키가 맞아야만 숫자를 줌 → 키는 이 SQL 끝에서 한 번 보여줌
--  · 다시 실행해도 괜찮음 (키는 처음 만든 것 그대로 유지)
-- ============================================================
create table if not exists public.hq_link (
  id   int primary key default 1 check (id = 1),
  key  text not null default replace(gen_random_uuid()::text, '-', ''),
  made_at timestamptz not null default now()
);
alter table public.hq_link enable row level security;     -- 정책 없음 = 앱에서 아무도 못 읽음
revoke all on public.hq_link from anon, authenticated;
insert into public.hq_link (id) values (1) on conflict (id) do nothing;

create or replace function public.hq_stats(p_key text)
returns json language plpgsql security definer set search_path = public as $$
declare
  v_launch timestamptz := timestamptz '2026-11-24 00:00+09';
  v_today  date := (now() at time zone 'Asia/Seoul')::date;
  v_new    int;  v_makers int;  v_d1_base int;  v_d1_back int;
  r json;
begin
  if p_key is null or p_key <> (select key from hq_link where id = 1) then
    raise exception '연결 키가 맞지 않아요';
  end if;

  select count(*) into v_new from auth.users where created_at >= v_launch;
  select count(distinct w.owner_id) into v_makers
    from works w join auth.users u on u.id = w.owner_id
   where u.created_at >= v_launch;
  -- 다음 날 재방문: 출시 후 가입했고 '가입 다음 날'이 이미 지난 사람 중, 그 다음 날 앱을 연 사람
  select count(*) into v_d1_base from auth.users
   where created_at >= v_launch and (created_at at time zone 'Asia/Seoul')::date < v_today;
  select count(*) into v_d1_back from auth.users u
   where u.created_at >= v_launch and (u.created_at at time zone 'Asia/Seoul')::date < v_today
     and exists (select 1 from visit_days v where v.user_id = u.id
                  and v.day = (u.created_at at time zone 'Asia/Seoul')::date + 1);

  select json_build_object(
    'at',            now(),
    'launch',        v_launch,
    'users_all',     (select count(*) from auth.users),
    'users_new',     v_new,
    'users_today',   (select count(*) from auth.users where (created_at at time zone 'Asia/Seoul')::date = v_today),
    'active_today',  (select count(*) from visit_days where day = v_today),
    'active_yday',   (select count(*) from visit_days where day = v_today - 1),
    'works_new',     (select count(*) from works where created_at >= v_launch),
    'works_today',   (select count(*) from works where (created_at at time zone 'Asia/Seoul')::date = v_today),
    'makers_new',    v_makers,
    'd1_base',       v_d1_base,
    'd1_back',       v_d1_back,
    'guestbook_new', (select count(*) from guestbook where created_at >= v_launch and deleted_at is null),
    'stamps_new',    (select count(*) from work_stamps where created_at >= v_launch),
    'reports_open',  (select count(*) from reports where status = 'open'),
    'daily', (select json_agg(json_build_object('d', d, 'n',
                (select count(*) from auth.users where (created_at at time zone 'Asia/Seoul')::date = d)) order by d)
              from generate_series(v_today - 6, v_today, interval '1 day') g(dd), lateral (select dd::date d) x)
  ) into r;
  return r;
end $$;

revoke all on function public.hq_stats(text) from public;
grant execute on function public.hq_stats(text) to anon, authenticated;

-- ▼ 이 줄 결과(연결 키)를 복사해서 HQ › 아고 › [이내만 연결]에 붙여넣기
select key as "HQ 연결 키 (복사)" from public.hq_link where id = 1;
