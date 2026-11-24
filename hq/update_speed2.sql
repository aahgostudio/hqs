-- 속도 2단계 (2026-11-24): 대표 대화 목록(chat_admin_home) 가볍게
--  · 직원 1:1 방 확인은 10분에 한 번만 · 목록에서 방마다 인원 계산 안 함 (직접 만든 방만)
create or replace function public.chat_admin_home() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare st public.staff; own boolean := public.is_owner(); me text := public._chat_who();
begin
  if not public.is_admin() then raise exception 'not_admin'; end if;
  -- 1124 속도: 직원별 1:1 방 확인은 10분에 한 번만 (예전엔 목록 볼 때마다 전 직원 확인)
  if coalesce((select (value #>> '{}')::timestamptz from public.settings where key = 'chat_ensure_at'), 'epoch'::timestamptz) < now() - interval '10 minutes' then
    for st in select * from public.staff where status <> 'left' and not hidden loop
      perform public._chat_ensure(st);
    end loop;
    insert into public.settings (key, value) values ('chat_ensure_at', to_jsonb(now()::text))
      on conflict (key) do update set value = excluded.value;
  end if;
  return jsonb_build_object(
    'on', coalesce((select value #>> '{}' from public.settings where key = 'chat_on'), 'false') = 'true',
    'owner', own,
    'rooms', coalesce((select jsonb_agg(x order by (x->>'closed')::boolean, (x->>'kind_o')::int, x->>'last_at' desc nulls last) from (
      select jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'grp', r.grp, 'title', public._chat_title_hq(r), 'custom_title', r.title,
        'staff_id', r.staff_id, 'job_id', r.job_id, 'keep', r.keep, 'mgr', public._chat_mgr(r),
        'closed', r.closed_at is not null or (r.kind = 'cust' and not exists (select 1 from public.jobs j where j.id = r.job_id and public._live_open(j))),
        'job_date', (select job_date from public.jobs j where j.id = r.job_id),
        'job_done', (select coalesce(j.work_done_at, j.done_at) from public.jobs j where j.id = r.job_id), 'closed_at', r.closed_at, 'created_at', r.created_at,
        'live', r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j)),
        'left_at', case when r.kind = 'dm' then (select left_at from public.staff where id = r.staff_id) end,
        'kind_o', case r.kind when 'all' then 1 when 'team' then 2 when 'custom' then 3 when 'cust' then 0 when 'site' then 4 else 5 end,
        'last', (select jsonb_build_object('body', case when m.deleted_at is not null then '삭제된 메시지' when coalesce(m.body,'') = '' then '사진' else m.body end,
                         'name', public._chat_msg_json(m, null, false)->>'name', 'at', m.created_at)
                   from public.chat_messages m where m.room_id = r.id order by m.id desc limit 1),
        'last_at', (select max(created_at) from public.chat_messages m where m.room_id = r.id),
        'count', (select count(*) from public.chat_messages m where m.room_id = r.id),
        'unread', (select count(*) from public.chat_messages m where m.room_id = r.id
                     and (m.cust or not (m.staff_id is null and (m.admin_uid = auth.uid() or (m.admin_uid is null and own))))
                     and m.id > coalesce((select last_id from public.chat_reads where room_id = r.id and who = me), 0)),
        'members', case when r.kind = 'custom' then (select coalesce(jsonb_agg(x2), '[]'::jsonb) from public._chat_members(r) x2) else '[]'::jsonb end   -- 1124: 목록엔 직접 만든 방만 (방 안 인원은 방 열 때 따로 받음)
      ) x
      from public.chat_rooms r
     where own or (public._chat_mgr(r) and r.closed_at is null
                   and (r.kind <> 'site' or exists (select 1 from public.jobs j where j.id = r.job_id and public._chat_site_live(j))))) q), '[]'::jsonb));
end $$;
grant execute on function public.chat_admin_home() to authenticated;
select '업데이트 완료 · 속도 2단계' as result;
