-- 속도 3단계 (2026-11-25): 직원 대화 목록(chat_home) 가볍게
--  · 내 방 확인은 5분에 한 번만 · 현장·손님방은 목록에서 인원 계산 안 함
create or replace function public.chat_home(p_token text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare s public.staff := public._me(p_token);
begin
  if not public._chat_on(s) then return jsonb_build_object('on', false); end if;
  -- 1125 속도: 내 방 확인은 직원별 5분에 한 번만 (예전엔 목록 볼 때마다)
  if coalesce((select (value #>> '{}')::timestamptz from public.settings where key = 'chat_ensure_s:' || s.id), 'epoch'::timestamptz) < now() - interval '5 minutes' then
    perform public._chat_ensure(s);
    insert into public.settings (key, value) values ('chat_ensure_s:' || s.id, to_jsonb(now()::text))
      on conflict (key) do update set value = excluded.value;
  end if;
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
        'n', case when r.kind in ('all', 'team', 'custom') then (select count(*) from public._chat_members(r)) + 1 end,   -- 1125: 현장·손님방은 인원 계산 생략
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

select '업데이트 완료 · 속도 3단계' as result;
