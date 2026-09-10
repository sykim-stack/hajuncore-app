# HajunAI 상품검증 확장 연동 계약

> **상태:** 1차 계약 고정 / 캡처 구현 전
> **갱신일:** 2026-09-09
> **공유 저장소:** `hajuncore-app` · `brainpool-core-final`
> **기준 브랜치:** `master`

## 역할 분리

```text
brainpool-core-final
  사용자가 열어 둔 온채널·네이버 페이지에서 수동 캡처

hajuncore-app
  상품 원문·검증 이력 저장, 중복 확인, 마당·거실·방 조회
```

확장 프로그램은 로그인 정보나 쿠키를 저장하지 않는다. 자동 로그인·대량 페이지 순회·자동 승인도 하지 않는다.

## 원본과 중복

상품 원문과 검증 이력의 원본은 HajunAI의 `hajun_messages`다. `hajun_posts`에는 상품 원문을 저장하지 않는다.

```text
internal_code = source + ":" + source_product_code
```

같은 상품을 다시 캡처하는 것은 새 원문 복제가 아니라 재수집 이력으로 처리한다. 기존 원문은 수정·삭제하지 않는다.

## 현재 사용 API

```text
GET  /api/hajun?action=yard_list
GET  /api/hajun?action=room_list&yard={yard_key}
POST /api/hajun?action=post_message
GET  /api/hajun?action=product_candidates
GET  /api/hajun?action=product_random
GET  /api/hajun?action=product_timeline&internal_code={code}
```

현재 상품 후보 조회 API는 `metadata.entity_type=product_candidate`인 메시지만 읽는다. 캡처 저장 API는 아래 계약으로 연결하되, 실제 구현 전 DB의 `metadata` 컬럼 존재 여부를 확인한다.

현재 저장 API와 코어 파이널의 상품 캡처 전달 action은 코드에 연결되어 있다. 운영 API 재검증 결과 `product_validation` 마당과 4개 방, `hajun_messages.metadata` 기반 상품 후보가 실제로 존재한다. migration 파일은 `supabase/migrations/20260909_product_validation_metadata.sql`이며, 운영 DB 적용 이력은 별도 배포·운영 기록과 함께 관리한다.

## 캡처 저장 payload 초안

```json
{
  "type": "PRODUCT_CAPTURED",
  "yard_key": "product_validation",
  "room_key": "product_discovery",
  "author_type": "human",
  "author_name": "브라이언풀 확장",
  "msg_type": "doc_injection",
  "content": "사용자가 확인 가능한 상품 원문",
  "ref_ids": [],
  "metadata": {
    "entity_type": "product_candidate",
    "internal_code": "onchannel:CH5390239",
    "source": "onchannel",
    "source_product_code": "CH5390239",
    "name": "상품명",
    "cost_price": 830,
    "supplier_shipping_fee": 2800,
    "source_url": "https://...",
    "image_url": "https://...",
    "captured_at": "2026-09-09T00:00:00Z"
  }
}
```

네이버 시장조사 캡처는 같은 `internal_code`를 사용해 `market_research` 메시지로 연결한다. 동일상품 여부는 자동 확정하지 않는다.

## 확인 대기 규칙

```text
캡처 → 검토 대기
AI 분석 → adopted 성격의 검토 대기
사람 확정 → confirmed decision
```

확장 프로그램은 캡처 후 자동 승인하거나 CoreHub로 이관하지 않는다. 저장 성공 응답에는 원본 message ID를 표시해 후속 `ref_ids` 연결에 사용한다.

## 구현 순서

1. HajunAI DB의 `metadata` 컬럼과 상품검증마당·방 key 확인
2. HajunAI `post_message`가 metadata를 안전하게 저장하도록 연결
3. HajunAI 캡처 저장·중복 응답 테스트
4. Core Final에 온채널 수동 캡처 추가
5. Core Final에 네이버 수동 조사 캡처 추가
6. 양쪽 live API로 원문 보존·중복·ref_ids 검증

## 금지

- `hajun_messages`와 `hajun_posts`에 동일 원문 이중 저장
- 별도 `products` 원본 테이블 선행 생성
- 상품별 방 자동 생성
- AI만으로 판매 승인
- 로그인 자격증명 저장
