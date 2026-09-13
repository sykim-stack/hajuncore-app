-- BRAINPOOL HajunAI 상품등록마당 seed
-- 적용 대상: HajunCore Supabase (Jena-Voca-01)
-- 원칙: 반복 실행해도 기존 마당·방·메시지를 중복 생성하지 않는다.
-- 원문 복제 금지. pass 이후 listing_draft는 ref_ids로만 검증 decision에 연결한다.
-- hajun_posts 미사용. 공식 원본은 hajun_messages.

begin;

-- listing 계열 entity 조회 인덱스
create index if not exists idx_hajun_messages_listing_entity
  on public.hajun_messages ((metadata ->> 'entity_type'))
  where metadata ->> 'entity_type' in (
    'listing_draft',
    'listing_content',
    'listing_published'
  );

create index if not exists idx_hajun_messages_listing_status
  on public.hajun_messages ((metadata ->> 'status'))
  where metadata ->> 'entity_type' in (
    'listing_draft',
    'listing_content',
    'listing_published'
  );

-- 상품등록마당. 이미 존재하면 보존.
insert into public.hajun_yards (key, name)
select 'product_listing', '상품등록마당'
where not exists (
  select 1 from public.hajun_yards where key = 'product_listing'
);

-- 기능별 방. 상품별 방은 만들지 않는다.
insert into public.hajun_rooms (yard_id, key, name)
select y.id, v.room_key, v.room_name
from public.hajun_yards y
cross join (values
  ('listing_queue', '등록대기방'),
  ('listing_content', '콘텐츠제작방'),
  ('listing_published', '등록완료방')
) as v(room_key, room_name)
where y.key = 'product_listing'
  and not exists (
    select 1
    from public.hajun_rooms r
    where r.yard_id = y.id and r.key = v.room_key
  );

commit;

-- 적용 후 확인:
-- select key, name from public.hajun_yards where key = 'product_listing';
-- select r.key, r.name
-- from public.hajun_rooms r
-- join public.hajun_yards y on y.id = r.yard_id
-- where y.key = 'product_listing'
-- order by r.created_at;
