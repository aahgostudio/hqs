-- ============================================================
--  어닝플레이스 HQ 업데이트 v47 (2026-11-09)
--  🏷 셀렉트 (아고셀렉트 사입 → 등록 → 판매 → 정산)
--  · select_items : 사입 상품 (사입가·수량·판매가·판매 수량·상태·채널·사진)
--  · select 버킷  : 사입 현장 사진 (대표님만 올림, 한 번에 여러 장)
--  · settings.select_cfg : 네이버 수수료율·개당 택배비·포장비 (가정값, 바꿀 수 있음)
--  · 대표님 전용 (관리자 HQS 화면에는 안 보임)
-- ============================================================
create table if not exists public.select_items (
  id          bigint generated always as identity primary key,
  code        text,                                   -- AS-2611-001
  bought_on   date not null default current_date,     -- 사입일
  source      text,                                   -- 사입처 (내부용)
  name        text not null,                          -- 상품명 (처음엔 현장 메모)
  category    text,
  qty         int  not null default 0,                -- 사입 수량
  unit_cost   int  not null default 0,                -- 개당 사입가
  proof       text,                                   -- 세금계산서 / 현금영수증 / 카드 / 없음
  want_price  int,                                    -- 대표님 희망 판매가
  low_price   int,                                    -- 최저가 (비교)
  price       int,                                    -- 확정 판매가 (대표님)
  sold        int  not null default 0,                -- 판매 수량
  status      text not null default '접수',           -- 접수 / 등록초안 / 판매중 / 품절 / 판매중지
  store_no    text,                                   -- 스마트스토어 상품번호
  kc          text,                                   -- 확인완료 / 해당없음 / 표시없음
  channels    jsonb not null default '{}'::jsonb,     -- {store:0|1|2, insta, dg, threads} 0 대기 · 1 초안 · 2 게시
  photos      jsonb not null default '[]'::jsonb,     -- [{path, kind}] kind = 정면·측면·뒷면·손·라벨·바코드 (클로가 나중에 구분)
  memo        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.select_items enable row level security;
drop policy if exists "owner_all" on public.select_items;
create policy "owner_all" on public.select_items for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- 사입 사진 저장소 (공개 주소 · 대표님만 올리고 지움)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('select', 'select', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "select_owner_upload" on storage.objects;
create policy "select_owner_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'select' and public.is_owner());
drop policy if exists "select_owner_delete" on storage.objects;
create policy "select_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'select' and public.is_owner());

-- 기본 설정 (가정값 · 셀렉트 탭 › 설정에서 바꿈)
insert into public.settings (key, value)
values ('select_cfg', '{"fee":0.06,"ship":3500,"pack":500}'::jsonb)
on conflict (key) do nothing;

create or replace function public.hq_schema_version() returns int
language sql stable as $$ select greatest(47, 0) $$;

select '업데이트 완료 (v47) · 셀렉트' as result;
