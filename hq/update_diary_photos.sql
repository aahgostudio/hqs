-- 다이어리에 고객님 방(대화) 사진도 쓰기 (2026-11-25)
--  · 예전엔 현장노트 사진만 → 이제 고객님 방에 올린 사진도 전·후 사진으로
create or replace function public._diary_item(j public.jobs, p_no bigint, p_me uuid)
returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with ph as (
    select case when p.bucket = 'chat' then 'https://ldvknvmsnpbporxhnsli.supabase.co/storage/v1/object/public/chat/' || p.path else p.path end as path, p.stage, p.created_at from public.job_photos p
     where p.job_id = j.id and not p.hidden and coalesce(p.bucket, 'live') in ('live', 'chat')
       and lower(p.path) !~ '\.(mp4|mov|webm|m4v|heic|heif|pdf)$')
  select jsonb_build_object(
    'id', j.id, 'no', p_no, 'date', j.job_date, 'title', coalesce(nullif(j.live_title, ''), j.title), 'kind', j.kind,
    'crew', (select coalesce(jsonb_agg(s.name order by s.name), '[]'::jsonb) from public.assignments a join public.staff s on s.id = a.staff_id
              where a.job_id = j.id and a.status = 'approved'),
    'boss', coalesce(j.boss_on, false),
    'note', j.diary_note, 'cover', j.diary_cover,
    'before', (select path from ph order by (stage = 'before') desc, created_at asc limit 1),
    'after',  (select path from ph order by (stage = 'after') desc, created_at desc limit 1),
    'photo_n', (select count(*) from ph),
    'rx', (select coalesce(jsonb_object_agg(emoji, n), '{}'::jsonb) from (select emoji, count(*) n from public.diary_react where job_id = j.id group by emoji) z),
    'my_rx', (select coalesce(jsonb_agg(emoji), '[]'::jsonb) from public.diary_react where job_id = j.id and who = p_me::text),
    'cm_n', (select count(*) from public.diary_comment where job_id = j.id and not hidden),
    'mine', exists (select 1 from public.assignments a where a.job_id = j.id and a.staff_id = p_me and a.status = 'approved'))
$$;
revoke all on function public._diary_item(public.jobs, bigint, uuid) from public, anon, authenticated;

create or replace function public.staff_diary_one(p_token text, p_job bigint)
returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare me public.staff; j public.jobs; n bigint;
begin
  me := public._diary_me(p_token);
  select * into j from public.jobs where id = p_job and status not in ('cancelled', 'quote') and job_date <= public._today();
  if not found then raise exception 'not_found'; end if;
  select count(*) into n from public.jobs x where x.status not in ('cancelled', 'quote') and x.job_date <= public._today()
     and (x.job_date < j.job_date or (x.job_date = j.job_date and x.id <= j.id));
  return public._diary_item(j, n, me.id) || jsonb_build_object(
    'photos', (select coalesce(jsonb_agg(case when p.bucket = 'chat' then 'https://ldvknvmsnpbporxhnsli.supabase.co/storage/v1/object/public/chat/' || p.path else p.path end order by p.created_at), '[]'::jsonb) from public.job_photos p
                where p.job_id = j.id and not p.hidden and coalesce(p.bucket, 'live') in ('live', 'chat')
                  and lower(p.path) !~ '\.(mp4|mov|webm|m4v|heic|heif|pdf)$'),
    'comments', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', c.id, 'body', c.body, 'at', c.created_at, 'boss', c.boss, 'mine', c.staff_id = me.id,
                    'name', case when c.boss then '권성환' else s.name end,
                    'role', case when c.boss then '대표' else coalesce(nullif(s.role, ''), '') end) order by c.created_at), '[]'::jsonb)
                  from public.diary_comment c left join public.staff s on s.id = c.staff_id
                 where c.job_id = j.id and not c.hidden));
end $$;

select '업데이트 완료 · 다이어리 사진' as result;
