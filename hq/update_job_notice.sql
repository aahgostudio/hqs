-- ============================================================
--  새 현장 · 바뀐 현장 자동 알림 (2026-11-13)
--   · 새 현장(모집 중) 올리면 → 클린팀 방(없으면 📣 전체 방)에 '🆕 새 현장' 글 → 어닝톡 알림이 자동으로 감
--   · 인원 다 차면 → 같은 방에 '✅ 인원 다 찼어요'
--   · 내 현장 날짜·시간·주소 바뀌거나 취소 → 그 사람 1:1 방에 '⚠️ 내 현장 바뀜'
--   · 매일 저녁 8시 → 내일 일정 있는 사람 1:1 방에 '🌙 내일 일정'
--   · 대화방 글이라 알림을 안 켠 직원도 대화방에서 봄 (알림톡 대체도 기존 규칙 그대로)
--   · 고객 이름·전화·금액은 안 넣음
-- ============================================================
create or replace function private.jn_day(d date) returns text language sql immutable as $$
  select to_char(d, 'FMMM/FMDD') || '(' || (array['일','월','화','수','목','금','토'])[extract(dow from d)::int + 1] || ')'
$$;

-- 새 현장 글 올릴 방: 클린팀 방 → 없으면 전체 방
create or replace function private.jn_room() returns bigint language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.chat_rooms where kind = 'team' and grp = 'clean' and closed_at is null limit 1),
    (select id from public.chat_rooms where kind = 'all' and closed_at is null limit 1))
$$;

-- 그 직원 1:1 방 (없으면 만듦)
create or replace function private.jn_dm(p_staff uuid) returns bigint language plpgsql security definer set search_path = public as $$
declare rid bigint;
begin
  select id into rid from public.chat_rooms where kind = 'dm' and staff_id = p_staff limit 1;
  if rid is null then
    insert into public.chat_rooms (kind, staff_id) values ('dm', p_staff) returning id into rid;
  elsif exists (select 1 from public.chat_rooms where id = rid and closed_at is not null) then
    update public.chat_rooms set closed_at = null where id = rid;
  end if;
  return rid;
end $$;

create or replace function private.jn_line(j public.jobs) returns text language sql stable as $$
  select private.jn_day(j.job_date) || coalesce(' ' || to_char(j.start_time, 'HH24:MI'), '') || E'\n' || coalesce(nullif(j.live_title, ''), j.title)
$$;

create or replace function private.on_job_notice() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare rid bigint; ap int; a record; what text := '';
begin
  if coalesce((select (value->>'job_notice')::boolean from public.settings where key = 'live'), true) = false then return null; end if;
  if new.job_date < public._today() then return null; end if;
  select count(*) into ap from public.assignments where job_id = new.id and status = 'approved';

  -- 🆕 새 현장 (처음 올릴 때 · 견적 중 → 모집 중으로 바뀔 때) — 정기 묶음으로 한꺼번에 만든 건 뺌
  if new.status = 'open' and new.series_id is null and coalesce(new.kind, '') <> '용달'
     and (tg_op = 'INSERT' or old.status is distinct from 'open') and ap < coalesce(new.headcount, 1) then
    rid := private.jn_room();
    if rid is not null then
      insert into public.chat_messages (room_id, staff_id, body)
      values (rid, null, '🆕 새 현장 올라왔어요' || E'\n' || private.jn_line(new) || E'\n'
              || coalesce(new.headcount, 1) || '명 중 ' || (coalesce(new.headcount, 1) - ap) || '자리 남음' || E'\n' || '👉 일정판에서 신청해 주세요');
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- ✅ 인원 다 참
    if old.status = 'open' and new.status = 'full' and new.series_id is null then
      rid := private.jn_room();
      if rid is not null then
        insert into public.chat_messages (room_id, staff_id, body)
        values (rid, null, '✅ 인원 다 찼어요' || E'\n' || private.jn_day(new.job_date) || ' ' || coalesce(nullif(new.live_title, ''), new.title));
      end if;
    end if;
    -- ⚠️ 내 현장 바뀜 → 확정된 사람 1:1 방
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then what := '❌ 내 현장이 취소됐어요';
    else
      if new.job_date is distinct from old.job_date then what := what || E'\n날짜 ' || private.jn_day(old.job_date) || ' → ' || private.jn_day(new.job_date); end if;
      if new.start_time is distinct from old.start_time then what := what || E'\n시간 ' || coalesce(to_char(old.start_time, 'HH24:MI'), '미정') || ' → ' || coalesce(to_char(new.start_time, 'HH24:MI'), '미정'); end if;
      if new.address is distinct from old.address then what := what || E'\n주소가 바뀌었어요 (일정판에서 확인)'; end if;
      if what <> '' then what := '⚠️ 내 현장이 바뀌었어요' || what; end if;
    end if;
    if what <> '' then
      for a in select staff_id from public.assignments where job_id = new.id and status = 'approved' loop
        insert into public.chat_messages (room_id, staff_id, body)
        values (private.jn_dm(a.staff_id), null, what || E'\n' || private.jn_line(new));
      end loop;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists job_notice on public.jobs;
create trigger job_notice after insert or update of status, job_date, start_time, address on public.jobs
  for each row execute function private.on_job_notice();

-- 🌙 매일 저녁 8시: 내일 일정
create or replace function private.job_tomorrow() returns int
language plpgsql security definer set search_path = public, private as $$
declare s record; n int := 0; d date := public._today() + 1; txt text;
begin
  for s in select a.staff_id, string_agg(coalesce(to_char(j.start_time, 'HH24:MI') || ' ', '') || coalesce(nullif(j.live_title, ''), j.title), E'\n' order by j.start_time nulls first) as list
             from public.assignments a join public.jobs j on j.id = a.job_id
            where a.status = 'approved' and j.job_date = d and j.status not in ('cancelled', 'quote')
            group by a.staff_id loop
    txt := '🌙 내일 일정 · ' || private.jn_day(d) || E'\n' || s.list || E'\n' || '내일도 잘 부탁드려요!';
    insert into public.chat_messages (room_id, staff_id, body) values (private.jn_dm(s.staff_id), null, txt);
    n := n + 1;
  end loop;
  return n;
end $$;
select cron.unschedule('job_tomorrow') where exists (select 1 from cron.job where jobname = 'job_tomorrow');
select cron.schedule('job_tomorrow', '0 11 * * *', 'select private.job_tomorrow()');   -- UTC 11시 = 한국 저녁 8시

revoke all on function private.on_job_notice(), private.job_tomorrow(), private.jn_dm(uuid), private.jn_room() from public, anon, authenticated;
select '업데이트 완료 · 새 현장·바뀐 현장·내일 일정 자동 알림' as result;
