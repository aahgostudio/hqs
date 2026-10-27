-- ============================================================
--  어닝플레이스 HQ 업데이트 v13 (2026-10-28)
--  대화에 동영상 올리기: 저장소 50MB · 동영상 형식 허용, 알림톡 미리보기 '🎬 동영상'
-- ============================================================
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif',
                                  'video/mp4','video/quicktime','video/webm','video/3gpp','video/x-m4v']
 where id = 'chat';

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
  prev := private.cut(replace(replace(coalesce(nullif(trim(new.body), ''), case when new.photo ~* '\.(mov|mp4|m4v|webm|3gp)$' then '🎬 동영상' when new.photo is not null then '📷 사진' else '' end), E'\n', ' '), E'\r', ''), 40);

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


create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 13 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v13)' as result;
