-- ============================================================
--  어닝플레이스 HQ 업데이트 v44 (2026-11-06)
--  속도 개선 — "앱 느려요" 대응
--  · 원인: 대화 목록(chat_home)이 25초마다 지금까지 만든 '모든 방'(현장방·고객님방 포함)을
--          하나씩 권한 검사함 → 현장이 쌓일수록 매일 느려짐
--  · 해결: 내 방 후보만 먼저 추린 뒤 검사 + 자주 찾는 칸에 색인(목차) 추가
--  · 화면·기능 변화 없음 (보이는 방·숫자 그대로)
-- ============================================================

-- 1) 색인 (이미 있으면 건너뜀)
create index if not exists assignments_staff_ok on public.assignments (staff_id, job_id) where status = 'approved';
create index if not exists assignments_job_staff on public.assignments (job_id, staff_id);
create index if not exists chat_rooms_job on public.chat_rooms (job_id) where job_id is not null;
create index if not exists chat_rooms_open on public.chat_rooms (kind) where closed_at is null;
create index if not exists chat_members_staff on public.chat_members (staff_id, room_id);
create index if not exists jobs_date on public.jobs (job_date);
create index if not exists staff_token on public.staff (token);

-- 2) 대화 목록: 내 방 후보만 먼저 추리기 (나머지는 v24와 동일)
create or replace function public.chat_home(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  if not public._chat_on(s) then return jsonb_build_object('on', false); end if;
  perform public._chat_ensure(s);
  return jsonb_build_object('on', true, 'me', jsonb_build_object('id', s.id, 'name', s.name),
    'rooms', coalesce((select jsonb_agg(x order by (x->>'kind_o')::int, x->>'last_at' desc nulls last) from (
      select jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'title', case when r.kind = 'dm' then '대표님' else public._chat_title(r) end,
        'kind_o', case r.kind when 'dm' then 1 when 'all' then 2 when 'team' then 3 when 'site' then 4 when 'cust' then 4 else 5 end,
        'job_date', (select job_date from public.jobs j where j.id = r.job_id),
        'job_done', (select coalesce(j.work_done_at, j.done_at) from public.jobs j where j.id = r.job_id),
        'last', (select jsonb_build_object('body', case when m.deleted_at is not null then '삭제된 메시지' when m.body is null or m.body = '' then '사진' else m.body end,
                         'name', public._chat_msg_json(m, s.id, false)->>'name', 'at', m.created_at)
                   from public.chat_messages m where m.room_id = r.id order by m.id desc limit 1),
        'last_at', (select max(created_at) from public.chat_messages m where m.room_id = r.id),
        'unread', (select count(*) from public.chat_messages m where m.room_id = r.id
                     and m.id > coalesce((select last_id from public.chat_reads where room_id = r.id and who = s.id::text), 0)
                     and (m.staff_id is distinct from s.id)),
        'n', (select count(*) from public._chat_members(r)) + 1,
        'mgr', public._chat_mgr(r)
      ) x
      from public.chat_rooms r
      where r.closed_at is null
        and (   r.kind in ('all', 'team')
             or (r.kind = 'dm' and r.staff_id = s.id)
             or (r.kind in ('site', 'cust') and r.job_id in (select a.job_id from public.assignments a where a.staff_id = s.id and a.status = 'approved'))
             or (r.kind = 'custom' and exists (select 1 from public.chat_members cm where cm.room_id = r.id and cm.staff_id = s.id)))
        and public._chat_can(s, r)) q), '[]'::jsonb));
end $$;
grant execute on function public.chat_home(text) to anon, authenticated;

analyze public.assignments, public.chat_rooms, public.chat_messages, public.chat_reads, public.jobs, public.staff;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(44, 0) $$;

select '업데이트 완료 (v44) · 속도 개선' as result;
