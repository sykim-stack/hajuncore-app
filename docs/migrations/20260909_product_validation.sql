-- BRAINPOOL HajunAI 상품검증 MVP
-- 적용 대상: HajunCore Supabase
-- 원칙: 반복 실행해도 기존 마당·방·메시지를 중복 생성하지 않는다.
-- 신규 상품 원문은 hajun_messages에만 저장한다. hajun_posts는 사용하지 않는다.

begin;

-- 상품검증 메시지의 구조화 필드.
alter table public.hajun_messages
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_hajun_messages_product_entity
  on public.hajun_messages ((metadata ->> 'entity_type'))
  where metadata ->> 'entity_type' = 'product_candidate';

create index if not exists idx_hajun_messages_product_internal_code
  on public.hajun_messages ((metadata ->> 'internal_code'))
  where metadata ->> 'internal_code' is not null;

-- 상품검증마당을 생성한다. 이미 존재하면 기존 row를 보존한다.
insert into public.hajun_yards (key, name)
select 'product_validation', '상품검증마당'
where not exists (
  select 1 from public.hajun_yards where key = 'product_validation'
);

-- 기능별 방을 생성한다. 상품별 방은 만들지 않는다.
insert into public.hajun_rooms (yard_id, key, name)
select y.id, v.room_key, v.room_name
from public.hajun_yards y
cross join (values
  ('product_discovery', '상품발굴방'),
  ('market_research', '시장조사방'),
  ('product_validation', '검증방'),
  ('approved_products', '승인상품방')
) as v(room_key, room_name)
where y.key = 'product_validation'
  and not exists (
    select 1
    from public.hajun_rooms r
    where r.yard_id = y.id and r.key = v.room_key
  );

commit;

-- 적용 후 확인:
-- select key, name from public.hajun_yards where key = 'product_validation';
-- select r.key, r.name
-- from public.hajun_rooms r
-- join public.hajun_yards y on y.id = r.yard_id
-- where y.key = 'product_validation'
-- order by r.created_at;
-- select column_name, data_type
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'hajun_messages' and column_name = 'metadata';
