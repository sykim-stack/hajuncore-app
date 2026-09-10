-- HajunAI 상품검증 MVP
-- 상품 원문은 hajun_messages에만 저장하고 구조화 정보는 metadata에 보존한다.
-- 적용 전에는 확장프로그램의 상품 캡처 전송을 활성화하지 않는다.

alter table public.hajun_messages
  add column if not exists metadata jsonb;

create index if not exists hajun_messages_product_internal_code_idx
  on public.hajun_messages ((metadata->>'internal_code'))
  where metadata->>'entity_type' = 'product_candidate';

comment on column public.hajun_messages.metadata is
  '도메인별 구조화 정보. 상품검증은 entity_type=product_candidate를 사용하며 원문은 content에 보존한다.';
