-- 다이어리 대표님 한마디 알림 (2026-11-25)
--  · 대표님이 다이어리에 이야기를 남기면 → 그 현장에 함께한 직원 폰으로 푸시 (반응은 알림 없이 배지만)
create or replace function private.on_diary_boss() returns trigger
language plpgsql security definer set search_path = public, private as $$
declare j public.jobs; pushes jsonb := '[]'::jsonb; s record; base text := 'https://team.earningplace.kr';
begin
  if not new.boss then return new; end if;
  select * into j from public.jobs where id = new.job_id;
  for s in select st.id, st.token, (select jsonb_agg(p.sub) from public.push_subs p where p.who = st.id::text) subs
             from public.assignments a join public.staff st on st.id = a.staff_id
            where a.job_id = new.job_id and a.status = 'approved' and st.status <> 'left'
  loop
    if s.subs is null then continue; end if;
    pushes := pushes || jsonb_build_array(jsonb_build_object('subs', s.subs,
      'title', '📔 대표님 한마디',
      'body', coalesce(nullif(j.live_title, ''), j.title) || ' · ' || left(new.body, 60),
      'tag', 'diary-' || new.job_id,
      'url', base || '/clean/?k=' || s.token || '&dy=1'));
  end loop;
  perform private.push_send(pushes);
  return new;
exception when others then return new;   -- 알림이 실패해도 글은 꼭 올라가게
end $$;

drop trigger if exists diary_boss_push on public.diary_comment;
create trigger diary_boss_push after insert on public.diary_comment
  for each row execute function private.on_diary_boss();

select '업데이트 완료 · 다이어리 대표님 한마디 알림' as result;
