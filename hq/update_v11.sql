-- ============================================================
--  어닝플레이스 HQ 업데이트 v11 (2026-10-27)
--  카톡 알림톡 (솔라피) 연결
--   · 대화에 새 글 → 그 방 사람들 카톡으로 알림 (같은 방은 3분에 한 번만)
--   · 대표님 1:1 글 → '대표_1대1메시지' / 그 외 방 → '팀대화_새메시지'
--   · 직원이 쓴 글 → 대표님 폰에도 알림 (버튼 누르면 HQ 대화)
--   · 현장 확정 · 날짜/시간/주소 변경 · 취소 → '일정_확정변경'
--  Supabase → SQL Editor → 붙여넣고 Run → '업데이트 완료 (v11)'
--  ※ 솔라피 API 키는 이 파일에 없어요. 따로 받은 '키 넣기' SQL을 한 번 더 실행하세요.
-- ============================================================
create extension if not exists pg_net;
create extension if not exists pgcrypto with schema extensions;

-- 비밀 보관 (직원·외부에서 못 읽는 별도 공간)
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.solapi (
  id int primary key default 1 check (id = 1),
  api_key text not null,
  api_secret text not null,
  updated_at timestamptz not null default now()
);
revoke all on private.solapi from public, anon, authenticated;

-- 설정 (비밀 아님)
insert into public.settings (key, value) values ('alimtalk', jsonb_build_object(
  'on', true,
  'pf', 'KA01PF261027020116334r0460e2yJ9A',
  'tpl_team',  'KA01TP261027021129043CtbQ889azrg',
  'tpl_dm',    'KA01TP261027021536769RhiH53GGqVN',
  'tpl_sched', 'KA01TP261027021638290fWrOjtOko79',
  'boss_phone', '010-7193-2246',
  'boss_chat', true,
  'sched', true,
  'cool_min', 3
)) on conflict (key) do nothing;

create table if not exists private.notify_log (
  room_id bigint not null,
  who     text   not null,
  at      timestamptz not null default now(),
  primary key (room_id, who)
);
revoke all on private.notify_log from public, anon, authenticated;

create or replace function private.cfg() returns jsonb language sql stable as $$
  select coalesce((select value from public.settings where key = 'alimtalk'), '{}'::jsonb)
$$;

create or replace function private.digits(p text) returns text language sql immutable as $$
  select nullif(regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g'), '')
$$;

create or replace function private.cut(p text, n int) returns text language sql immutable as $$
  select case when char_length(coalesce(p,'')) > n then left(p, n - 1) || '…' else coalesce(p,'') end
$$;

-- 솔라피로 보내기 (messages: [{to, tpl, vars}])
create or replace function private.send(p_msgs jsonb) returns bigint
language plpgsql security definer set search_path = public, extensions, private as $$
declare k private.solapi; c jsonb := private.cfg(); d text; salt text; sig text; body jsonb; rid bigint;
begin
  if coalesce((c->>'on')::boolean, false) = false then return null; end if;
  select * into k from private.solapi where id = 1;
  if k.api_key is null or jsonb_array_length(coalesce(p_msgs, '[]'::jsonb)) = 0 then return null; end if;
  d := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  salt := encode(extensions.gen_random_bytes(16), 'hex');
  sig := encode(extensions.hmac(d || salt, k.api_secret, 'sha256'), 'hex');
  select jsonb_build_object('allowDuplicates', true, 'messages', jsonb_agg(jsonb_build_object(
           'to', private.digits(m->>'to'),
           'kakaoOptions', jsonb_build_object('pfId', c->>'pf', 'templateId', m->>'tpl', 'variables', m->'vars', 'disableSms', true))))
    into body from jsonb_array_elements(p_msgs) m where private.digits(m->>'to') is not null;
  if body is null or body->'messages' is null then return null; end if;
  select net.http_post(
           url := 'https://api.solapi.com/messages/v4/send-many/detail',
           body := body,
           headers := jsonb_build_object('Content-Type', 'application/json',
             'Authorization', format('HMAC-SHA256 apiKey=%s, date=%s, salt=%s, signature=%s', k.api_key, d, salt, sig)))
    into rid;
  return rid;
end $$;
revoke all on function private.send(jsonb) from public, anon, authenticated;

-- 링크 코드: 클린 = 일정판 토큰, 부동산 = m.매물노트코드 (+ .방번호)
create or replace function private.code(s public.staff, p_room bigint) returns text language sql stable as $$
  select (case when s.team = 'RES' and s.maemul_code is not null then 'm.' || s.maemul_code else s.token end)
         || case when p_room is null then '' else '.' || p_room end
$$;

-- 대화 새 글 → 알림
create or replace function private.on_chat_msg() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
declare r public.chat_rooms; c jsonb := private.cfg(); cool interval; sender text; title text; prev text; msgs jsonb := '[]'::jsonb; s public.staff;
begin
  if new.deleted_at is not null then return null; end if;
  select * into r from public.chat_rooms where id = new.room_id;
  if r.id is null or r.closed_at is not null then return null; end if;
  cool := make_interval(mins => coalesce((c->>'cool_min')::int, 3));
  sender := case when new.staff_id is null then '대표' else coalesce((select name from public.staff where id = new.staff_id), '직원') end;
  title := public._chat_title(r);
  prev := private.cut(replace(replace(coalesce(nullif(trim(new.body), ''), case when new.photo is not null then '📷 사진' else '' end), E'\n', ' '), E'\r', ''), 40);

  for s in select st.* from public.staff st
            where st.id in (select public._chat_members(r))
              and st.id is distinct from new.staff_id
              and private.digits(st.phone) is not null
              and public._chat_on(st)
              and (r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j)))
  loop
    if exists (select 1 from private.notify_log l where l.room_id = r.id and l.who = s.id::text and l.at > now() - cool) then continue; end if;
    insert into private.notify_log (room_id, who, at) values (r.id, s.id::text, now())
      on conflict (room_id, who) do update set at = excluded.at;
    if r.kind = 'dm' and new.staff_id is null then
      msgs := msgs || jsonb_build_array(jsonb_build_object('to', s.phone, 'tpl', c->>'tpl_dm',
                'vars', jsonb_build_object('#{미리보기}', prev, '#{코드}', private.code(s, r.id))));
    else
      msgs := msgs || jsonb_build_array(jsonb_build_object('to', s.phone, 'tpl', c->>'tpl_team',
                'vars', jsonb_build_object('#{방이름}', title, '#{보낸사람}', sender, '#{미리보기}', prev, '#{코드}', private.code(s, r.id))));
    end if;
  end loop;

  -- 직원이 쓴 글 → 대표님께도
  if new.staff_id is not null and coalesce((c->>'boss_chat')::boolean, true) and private.digits(c->>'boss_phone') is not null
     and not exists (select 1 from private.notify_log l where l.room_id = r.id and l.who = 'boss' and l.at > now() - cool) then
    insert into private.notify_log (room_id, who, at) values (r.id, 'boss', now())
      on conflict (room_id, who) do update set at = excluded.at;
    msgs := msgs || jsonb_build_array(jsonb_build_object('to', c->>'boss_phone', 'tpl', c->>'tpl_team',
              'vars', jsonb_build_object('#{방이름}', case when r.kind = 'dm' then sender || '님 1:1' else title end,
                                         '#{보낸사람}', sender, '#{미리보기}', prev, '#{코드}', 'hq.' || r.id)));
  end if;

  perform private.send(msgs);
  return null;
exception when others then
  return null;   -- 알림이 실패해도 대화 저장은 그대로
end $$;

drop trigger if exists chat_notify on public.chat_messages;
create trigger chat_notify after insert on public.chat_messages for each row execute function private.on_chat_msg();

-- 일정 확정 · 변경 · 취소 → 알림
create or replace function private.sched_msg(p_j public.jobs, p_s public.staff, p_state text) returns jsonb
language sql stable set search_path = public, private as $$
  select jsonb_build_object('to', (p_s).phone, 'tpl', private.cfg()->>'tpl_sched', 'vars', jsonb_build_object(
    '#{날짜}', to_char((p_j).job_date, 'FMMM/FMDD') || '(' || (array['일','월','화','수','목','금','토'])[extract(dow from (p_j).job_date)::int + 1] || ')',
    '#{시간}', coalesce(to_char((p_j).start_time, 'HH24:MI'), '시간 미정'),
    '#{현장이름}', private.cut(coalesce((p_j).title, '현장'), 40),
    '#{상태}', p_state,
    '#{코드}', (p_s).token))
$$;

create or replace function private.on_assign() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
declare j public.jobs; s public.staff;
begin
  if coalesce((private.cfg()->>'sched')::boolean, true) = false then return null; end if;
  if new.status <> 'approved' or (tg_op = 'UPDATE' and old.status = 'approved') then return null; end if;
  select * into j from public.jobs where id = new.job_id;
  select * into s from public.staff where id = new.staff_id;
  if j.id is null or s.id is null or j.job_date < (now() at time zone 'Asia/Seoul')::date or s.status = 'left' or private.digits(s.phone) is null then return null; end if;
  perform private.send(jsonb_build_array(private.sched_msg(j, s, '확정')));
  return null;
exception when others then return null;
end $$;
drop trigger if exists assign_notify on public.assignments;
create trigger assign_notify after insert or update of status on public.assignments for each row execute function private.on_assign();

create or replace function private.on_job() returns trigger
language plpgsql security definer set search_path = public, extensions, private as $$
declare st text; msgs jsonb;
begin
  if coalesce((private.cfg()->>'sched')::boolean, true) = false then return null; end if;
  if new.job_date < (now() at time zone 'Asia/Seoul')::date then return null; end if;
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then st := '취소';
  elsif new.status <> 'cancelled' and (new.job_date is distinct from old.job_date or new.start_time is distinct from old.start_time or new.address is distinct from old.address) then st := '변경';
  else return null; end if;
  select coalesce(jsonb_agg(private.sched_msg(new, s, st)), '[]'::jsonb) into msgs
    from public.assignments a join public.staff s on s.id = a.staff_id
   where a.job_id = new.id and a.status = 'approved' and s.status <> 'left' and private.digits(s.phone) is not null;
  perform private.send(msgs);
  return null;
exception when others then return null;
end $$;
drop trigger if exists job_notify on public.jobs;
create trigger job_notify after update on public.jobs for each row execute function private.on_job();

-- HQ: 대표님 폰으로 3종 테스트 · 발송 결과 보기
create or replace function public.alimtalk_test() returns text
language plpgsql security definer set search_path = public, extensions, private as $$
declare c jsonb := private.cfg(); p text := c->>'boss_phone';
begin
  if not (public.is_admin() or current_user in ('postgres','supabase_admin')) then raise exception 'not_allowed'; end if;
  if not exists (select 1 from private.solapi) then return '솔라피 키가 아직 없어요 (키 넣기 SQL 실행 필요)'; end if;
  perform private.send(jsonb_build_array(
    jsonb_build_object('to', p, 'tpl', c->>'tpl_team', 'vars', jsonb_build_object('#{방이름}', '클린팀', '#{보낸사람}', '테스트', '#{미리보기}', '알림 테스트예요', '#{코드}', 'hq')),
    jsonb_build_object('to', p, 'tpl', c->>'tpl_dm',   'vars', jsonb_build_object('#{미리보기}', '알림 테스트예요', '#{코드}', 'hq')),
    jsonb_build_object('to', p, 'tpl', c->>'tpl_sched','vars', jsonb_build_object('#{날짜}', '11/1(일)', '#{시간}', '08:00', '#{현장이름}', '테스트 현장', '#{상태}', '확정', '#{코드}', 'hq'))));
  return '보냈어요 (' || p || ')';
end $$;

create or replace function public.alimtalk_log() returns jsonb
language sql stable security definer set search_path = public, net as $$
  select case when public.is_admin() or current_user in ('postgres','supabase_admin') then coalesce((select jsonb_agg(x order by x.created desc) from (
    select id, status_code, left(content, 400) as content, error_msg, created from net._http_response order by created desc limit 8) x), '[]'::jsonb)
  else '[]'::jsonb end
$$;
revoke all on function public.alimtalk_test() from public, anon;
revoke all on function public.alimtalk_log() from public, anon;
grant execute on function public.alimtalk_test(), public.alimtalk_log() to authenticated;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 11 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v11)' as result;
