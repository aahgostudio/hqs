-- 특정 사람에게만 보이는 현장 (2026-11-19)
--  · '특정 사람에게만 보이기'를 고른 현장은 팀 대화방 안내 안 나감 → 고른 사람 1:1 방으로만 '📢 [맡긴 현장]'
--  · 나중에 고른 사람을 바꾸면(이관) 새로 들어간 사람에게만 알림
--  · 맨 아래: 다른 직원 일정판에서 실제로 숨겨지는지 확인 결과
create or replace function private.on_job_notice() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare rid bigint; ap int; a record; what text := ''; t uuid; tg boolean := coalesce(array_length(new.target_staff, 1), 0) > 0;
begin
  if coalesce((select (value->>'job_notice')::boolean from public.settings where key = 'live'), true) = false then return null; end if;
  if new.job_date < public._today() then return null; end if;
  select count(*) into ap from public.assignments where job_id = new.id and status = 'approved';

  -- 🔒 특정 사람에게만: 처음 올릴 때 / 사람이 바뀔 때 → 새로 들어간 사람 1:1 방만
  if tg and new.status in ('open', 'full') and (tg_op = 'INSERT' or new.target_staff is distinct from old.target_staff or old.status is distinct from new.status and new.status = 'open') then
    foreach t in array new.target_staff loop
      if tg_op = 'INSERT' or old.target_staff is null or not (t = any(old.target_staff)) or old.status is distinct from new.status then
        insert into public.chat_messages (room_id, staff_id, body)
        values (private.jn_dm(t), null, '📢 [맡긴 현장] 확인해 주세요' || E'\n' || private.jn_line(new) || E'\n'
                || coalesce(new.headcount, 1) || '명' || case when new.contract_mode is not null then ' · 도급' else '' end || E'\n' || '👉 일정판에서 확인·신청해 주세요');
      end if;
    end loop;
  end if;

  -- 📢 팀 전체: 7일 안 · 정기 제외 · 특정 사람 지정 안 한 것만
  if not tg and new.status = 'open' and new.series_id is null and coalesce(new.kind, '') <> '용달' and new.job_date <= public._today() + 7
     and (tg_op = 'INSERT' or old.status is distinct from 'open' or coalesce(array_length(old.target_staff, 1), 0) > 0) and ap < coalesce(new.headcount, 1) then
    rid := private.jn_room();
    if rid is not null then
      insert into public.chat_messages (room_id, staff_id, body)
      values (rid, null, '📢 [새 현장] 올라왔어요' || E'\n' || private.jn_line(new) || E'\n'
              || coalesce(new.headcount, 1) || '명 중 ' || (coalesce(new.headcount, 1) - ap) || '자리 남음' || E'\n' || '👉 일정판에서 신청해 주세요');
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if old.status = 'open' and new.status = 'full' and new.series_id is null and not tg and new.job_date <= public._today() + 7 then
      rid := private.jn_room();
      if rid is not null then
        insert into public.chat_messages (room_id, staff_id, body)
        values (rid, null, '✅ 인원 다 찼어요' || E'\n' || private.jn_day(new.job_date) || ' ' || coalesce(nullif(new.live_title, ''), new.title));
      end if;
    end if;
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
create trigger job_notice after insert or update of status, job_date, start_time, address, target_staff on public.jobs
  for each row execute function private.on_job_notice();

-- 7일 전 아침 9시 안내에서도 특정 사람 지정 현장은 뺌
create or replace function private.job_week_notice() returns int
language plpgsql security definer set search_path = public, private as $$
declare rid bigint := private.jn_room(); txt text; n int;
begin
  if rid is null then return 0; end if;
  select count(*), string_agg(private.jn_day(j.job_date) || coalesce(' ' || to_char(j.start_time, 'HH24:MI'), '') || ' ' || coalesce(nullif(j.live_title, ''), j.title)
           || ' · ' || (coalesce(j.headcount, 1) - (select count(*) from public.assignments a where a.job_id = j.id and a.status = 'approved')) || '자리', E'\n' order by j.start_time nulls first)
    into n, txt
    from public.jobs j
   where j.status = 'open' and j.series_id is null and coalesce(j.kind, '') <> '용달' and j.job_date = public._today() + 7
     and coalesce(array_length(j.target_staff, 1), 0) = 0
     and (select count(*) from public.assignments a where a.job_id = j.id and a.status = 'approved') < coalesce(j.headcount, 1);
  if n > 0 then
    insert into public.chat_messages (room_id, staff_id, body)
    values (rid, null, '📢 [새 현장] 사람이 필요해요' || E'\n' || txt || E'\n' || '👉 일정판에서 신청해 주세요');
  end if;
  return n;
end $$;

select case when (select string_agg(pg_get_functiondef(p.oid), ' ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                   where n.nspname = 'public' and p.proname = '_can_see') like '%target_staff%'
            then '업데이트 완료 · 다른 직원 일정판에서도 숨겨져요 ✅'
            else '업데이트 완료 · ⚠️ 알림은 가렸는데, 일정판 숨김 규칙이 없어요 (클로에게 이 글 보여주세요)' end as result;
