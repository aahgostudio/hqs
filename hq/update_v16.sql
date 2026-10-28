-- ============================================================
--  어닝플레이스 HQ 업데이트 v16 (2026-10-28)
--  대화에 문서 보내기: PDF·한글·엑셀·워드·PPT·ZIP·TXT·CSV 허용 (50MB까지)
-- ============================================================
update storage.buckets
   set file_size_limit = 52428800,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif',
                                  'video/mp4','video/quicktime','video/webm','video/3gpp','video/x-m4v',
                                  'application/pdf','text/plain','text/csv','application/zip','application/x-zip-compressed',
                                  'application/x-hwp','application/haansofthwp','application/vnd.hancom.hwp','application/vnd.hancom.hwpx','application/hwp+zip',
                                  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                  'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                  'application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation',
                                  'application/octet-stream']
 where id = 'chat';

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select 16 $$;
grant execute on function public.hq_schema_version() to anon, authenticated;

select '업데이트 완료 (v16)' as result;
