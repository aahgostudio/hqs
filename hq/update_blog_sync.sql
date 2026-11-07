-- ============================================================
--  블로그 글 → 홍보 진행 자동 체크 (2026-11-07)
--   · 구글 앱스 스크립트가 10분마다 청소 블로그(landys_earningplace) 새 글 목록을 보내면
--   · 글 제목과 현장 이름이 겹치는 현장(글 날짜 기준 45일 안)을 찾아 '블로그 ✓' + 링크 붙임
-- ============================================================
create or replace function public.promo_blog_sync(p_key text, p_posts jsonb)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare p jsonb; best record; out jsonb := '[]'::jsonb; d date;
begin
  if p_key is null or p_key is distinct from (select value #>> '{}' from public.settings where key = 'ics_key') then
    raise exception 'not_allowed';
  end if;
  for p in select * from jsonb_array_elements(coalesce(p_posts, '[]'::jsonb)) loop
    continue when coalesce(p->>'url', '') = '' or coalesce(p->>'title', '') = '';
    -- 이미 붙은 글이면 건너뜀
    continue when exists (select 1 from public.jobs j, jsonb_array_elements(j.promo_links) l where l->>'url' = p->>'url');
    d := coalesce(nullif(p->>'date', '')::date, public._today());
    select j.id, s.score into best
      from public.jobs j
      cross join lateral (
        select count(*)::int as score
          from regexp_split_to_table(regexp_replace(j.title, '[0-9]+평|[()·,]', ' ', 'g'), '\s+') w
         where length(w) >= 2
           and w not in ('청소','이사청소','입주청소','퇴실청소','정기청소','이사','입주','퇴실','부분인테리어청소','상가','사무실','아파트','오피스텔','부산','정기')
           and position(w in p->>'title') > 0) s
     where j.status <> 'cancelled' and j.job_date between d - 45 and d + 1
     order by s.score desc, j.job_date desc
     limit 1;
    if best.id is not null and best.score >= 2 then
      update public.jobs
         set promo = coalesce(promo, '{}'::jsonb) || '{"blog":1}'::jsonb,
             promo_links = coalesce(promo_links, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('ch','블로그','k','blog','url',p->>'url','at',now(),'auto',true))
       where id = best.id;
      out := out || jsonb_build_array(jsonb_build_object('job', best.id, 'title', p->>'title'));
    end if;
  end loop;
  return out;
end $$;
grant execute on function public.promo_blog_sync(text, jsonb) to anon, authenticated;

select '업데이트 완료 · 블로그 자동 체크' as result;
