# HajunAI 상품검증 확장프로그램 계약

## 목적

BRAINPOOL Core Final Chrome Extension이 로그인된 온채널·네이버 페이지에서 상품·시장조사 원문을 캡처하여 HajunCore의 상품검증 공간에 저장하기 위한 계약이다.

## 원본과 저장 경계

- 상품 원문과 검증 이력의 공식 원본은 `hajun_messages`다.
- `hajun_posts`에는 신규 상품 원문을 저장하지 않는다.
- `hajun_posts`는 과거 엔진방 자료가 필요한 경우에만 읽기 전용 참고 자료로 사용한다.
- CoreHub 이관 전까지 상품은 HajunAI 상품검증마당의 메시지 기록으로만 관리한다.

## 공간 계약

기본 공간 흐름은 다음과 같다.

```text
상품검증마당 → 거실 → 방
```

초기 방은 다음 네 개다.

| 역할 | 권장 key | 메시지 |
|---|---|---|
| 상품 발굴 | `product_discovery` | 공급처 상품 원문 |
| 시장 조사 | `market_research` | 네이버 조사 원문 |
| 검증 | `product_validation` | AI 분석과 이슈 |
| 승인 상품 | `approved_products` | 사람의 확정 결과 |

실제 key는 배포 DB에 이미 존재하는 값을 우선한다. 배포 DB에 상품검증마당 또는 방이 없으면 운영자가 먼저 seed/migration을 적용하고, 확장프로그램은 그 전까지 상품 캡처를 활성화하지 않는다.

## 상품 식별

```text
internal_code = source + ":" + source_product_code
```

예시는 다음과 같다.

```text
onchannel:CH5390239
```

상품명·이미지·URL만으로 동일상품을 확정하지 않는다. 동일한 `internal_code`의 재캡처는 기존 메시지와 이력을 조회하고, 원문을 다른 저장소에 복제하지 않는다.

## 메시지 저장 API

### Endpoint

```text
POST /api/hajun?action=post_message
```

### Body

```json
{
  "yard_key": "product_validation",
  "room_key": "product_discovery",
  "author_type": "human",
  "author_name": "온채널 캡처",
  "msg_type": "doc_injection",
  "content": "사람이 읽을 수 있는 원문",
  "ref_ids": [],
  "metadata": {
    "entity_type": "product_candidate",
    "internal_code": "onchannel:CH5390239",
    "source": "onchannel",
    "source_product_code": "CH5390239",
    "source_url": "https://...",
    "captured_at": "2026-09-09T00:00:00.000Z",
    "cost_price": 830,
    "supplier_shipping_fee": 2800,
    "price_policy": "free",
    "image_url": "https://..."
  }
}
```

`metadata`는 시스템이 검색·중복 확인·계산에 사용하는 구조화 데이터다. `content`는 원문 보존과 사람이 읽는 확인을 위한 데이터다.

## 메시지 유형

- `doc_injection`: 공급처·네이버의 원문 캡처
- `understanding`: 상품 정보 정리
- `question`: 확인이 필요한 사항
- `answer`: 사람 또는 AI의 답변
- `issue`: 가격 역전, 배송비, 동일상품 불일치 등
- `decision`: 사람의 판정
- `work_result`: 검증 작업 결과

AI 분석은 사람의 확정이 아니다. 사람 승인 전에는 `confirmed` 상태로 처리하지 않는다.

## 조회 API

다음 조회 action은 `hajun_messages`를 기준으로 한다.

```text
GET /api/hajun?action=product_candidates
GET /api/hajun?action=product_random
GET /api/hajun?action=product_timeline&internal_code=onchannel%3ACH5390239
```

조회 결과는 원문 message ID를 포함해야 하며, 검증 메시지는 `ref_ids`로 기존 상품 원문 또는 시장조사 메시지를 연결한다.

## 확장프로그램 동작 제한

확장프로그램은 사용자가 현재 열어 둔 페이지에서 버튼을 눌렀을 때만 읽는다.

- 자동 로그인 금지
- 비밀번호·쿠키 저장 및 전송 금지
- 대량 자동 순회 금지
- 자동 승인 금지
- CoreHub 자동 이관 금지
- 네이버 동일상품 자동 확정 금지

## 활성화 전 조건

1. 배포 DB에 `metadata` 저장이 가능한지 확인한다.
2. 상품검증마당과 네 개 방의 실제 key를 확인한다.
3. `post_message`가 저장 후 message ID를 반환하는지 확인한다.
4. 동일 상품 재캡처 및 실패 응답 테스트를 완료한다.
5. 조건을 충족하기 전에는 온채널·네이버 extractor를 활성화하지 않는다.

## 테스트 기준

- 신규 상품 캡처가 `hajun_messages`에 한 번 저장된다.
- 저장 응답에 message ID가 포함된다.
- 같은 `internal_code` 재캡처 시 기존 후보가 조회된다.
- 시장조사 메시지가 같은 `internal_code`를 가진다.
- 검증 요청의 `ref_ids`가 원문 메시지를 가리킨다.
- AI 분석만으로 승인 상태가 되지 않는다.
- `hajun_posts`에는 신규 상품 원문이 생성되지 않는다.
- 저장 실패 시 원문 payload를 확장프로그램이 보존한다.
