# 상품 운영 Message Architecture

> **작성일:** 2026-09-12
> **상태:** V2 상품 운영 흐름의 기준 아키텍처
> **핵심 원칙:** 방은 View이고, HajunAI Message가 원본 사건 기록이다.

## 1. 결론

상품 운영은 추천·공급처 후보·시장조사·검증·콘텐츠·승인·판매 시작을 각각 별도 원본 테이블이나 강한 방 객체로 만드는 시스템이 아니다. 모든 사건은 `hajun_messages`에 저장하고, `ref_ids`, `metadata`, `msg_type`, `context`로 앞뒤 맥락을 연결한다.

```text
HajunAI Message = 원본 사건·업무 기록
CoreHub         = 분석·판단·이벤트 생성
HajunAI         = Message를 통한 맥락 연결과 AI 처리
CoreNull        = 원본 Message를 공간 안에서 View
방              = Message의 목적별 View
오늘의 발견     = 이벤트 상태를 View로 표현
```

## 2. 상품 운영 이벤트 흐름

```text
product_recommendation
        ↓ ref_ids
supplier_candidate
        ↓ ref_ids
market_research
        ↓ ref_ids
validation_decision
        ↓ ref_ids
content_work
        ↓ ref_ids
approval_decision
        ↓ ref_ids
sales_started
```

각 단계는 새 메시지를 append한다. 앞 단계의 메시지를 수정하거나 삭제하지 않는다. 한 상품의 전체 흐름은 연결된 Message graph로 추적한다.

## 3. 방은 Message View다

방은 원본 저장소가 아니다. 같은 `hajun_messages`를 목적에 따라 보여주는 View로 이해한다.

| View | 기본적으로 보여줄 메시지 유형 | 역할 |
|---|---|---|
| 상품추천방 | `product_recommendation` | AI가 현시점 상품 기회를 제안 |
| 상품발굴방 | `supplier_candidate` | 온채널 등 공급처 후보 저장 |
| 시장조사방 | `market_research` | 네이버 등 시장 자료 저장 |
| 검증방 | `validation_decision`, `room_context` | 품질·수익성·위험 판단 |
| 콘텐츠제작방 | `content_work` | 상품명·썸네일·상세 이미지·설명 작업 |
| 승인상품방 | `approval_decision`, `sales_started` | 최종 승인과 판매 시작 기록 |

초기 구현에서는 기존 네 방을 유지하고 메시지 유형과 `metadata`로 View를 구분할 수 있다. 별도 방을 추가하더라도 방을 원본 테이블처럼 취급하지 않는다.

## 4. Message 계약

### AI 추천

```json
{
  "msg_type": "work_result",
  "metadata": {
    "entity_type": "product_recommendation",
    "recommendation_id": "rec-20260912-001",
    "search_keywords": ["차량용 주차번호판"],
    "why_now": "현재 수요와 계절성",
    "target_customer": "차량 보유자",
    "risk_flags": ["경쟁 상품 다수"],
    "next_action": "온채널 공급가 확인"
  }
}
```

### 공급처 후보

```json
{
  "metadata": {
    "entity_type": "supplier_candidate",
    "source": "onchannel",
    "source_product_code": "CH2409972",
    "internal_code": "onchannel:CH2409972"
  },
  "ref_ids": ["추천 메시지 ID"]
}
```

기존 `product_candidate`는 호환성을 위해 읽을 수 있지만, 새 계약에서는 의미가 더 분명한 `supplier_candidate`를 사용한다. 기존 운영 데이터의 일괄 변경은 하지 않는다.

### 시장조사

```json
{
  "metadata": {
    "entity_type": "market_research",
    "source": "naver",
    "internal_code": "naver:search:자동차 번호판"
  },
  "ref_ids": ["공급처 후보 메시지 ID"]
}
```

네이버 검색 결과는 자동으로 동일상품 확정이나 판매 승인이 되지 않는다.

### 검증 결정

```json
{
  "msg_type": "decision",
  "metadata": {
    "entity_type": "validation_decision",
    "decision": "pass",
    "review_status": "confirmed",
    "margin_estimate": 0.32,
    "risk_flags": []
  },
  "ref_ids": ["공급처 후보 ID", "시장조사 ID"]
}
```

`decision` 값은 최소 `pass`, `hold`, `reject`를 지원한다. AI가 작성한 분석은 `adopted` 성격의 검토 대기이며, `pass` 확정은 사람이 한다.

### 콘텐츠 작업

```json
{
  "metadata": {
    "entity_type": "content_work",
    "content_status": "draft",
    "product_name": "최종 상품명 초안",
    "thumbnail_status": "draft",
    "detail_image_status": "draft"
  },
  "ref_ids": ["검증 결정 메시지 ID"]
}
```

상품명·썸네일·상세 이미지 작성 완료는 판매 승인과 다르다. 콘텐츠 결과는 사람이 검수해야 한다.

### 승인과 판매 시작

```json
{
  "metadata": {
    "entity_type": "approval_decision",
    "decision": "approved"
  },
  "ref_ids": ["검증 결정 ID", "콘텐츠 작업 ID"]
}
```

```json
{
  "metadata": {
    "entity_type": "sales_started",
    "channel": "smartstore",
    "listing_url": "https://..."
  },
  "ref_ids": ["승인 메시지 ID"]
}
```

판매 시작은 별도 명시적 사건이다. 승인 메시지가 자동으로 판매 시작을 의미하지 않는다.

## 5. CoreHub 이벤트

CoreHub는 원본 상품 메시지를 소유하지 않는다. 분석·판단·상태 변화가 발생하면 이벤트를 생성하고, 그 이벤트를 HajunAI Message로 남긴다.

```json
{
  "msg_type": "work_result",
  "metadata": {
    "entity_type": "corehub_event",
    "event_type": "margin_declined",
    "severity": "warning",
    "status": "open",
    "summary": "경쟁가격 하락으로 예상 마진 감소"
  },
  "ref_ids": [
    "추천 메시지 ID",
    "공급처 후보 ID",
    "시장조사 ID",
    "검증 메시지 ID"
  ]
}
```

CoreHub 이벤트는 기존 상품 메시지를 덮어쓰지 않는다. 이벤트가 닫히거나 해결되면 새 상태 이벤트를 append한다.

## 6. 오늘의 발견

오늘의 발견은 상품 콘텐츠를 별도로 생성하는 기능이 아니다. CoreHub 이벤트와 상태를 View로 표현한다.

```text
CoreHub 감지:
최근 시장조사 결과
경쟁가격 하락
공급가 유지
예상마진 감소

HajunAI Message:
entity_type = corehub_event
status = open

View:
오늘의 발견
⚠ 이 상품의 예상 마진이 감소했습니다.
[검증 결과 보기]
```

따라서 기존 문서의 `오늘의 발견 생성`이라는 표현은 **CoreHub 이벤트·상태 생성**으로 해석한다. `오늘의 발견 표시`는 **이벤트 상태를 기반으로 한 View 표시**다.

## 7. 현재 코드와의 호환 전략

현재 구현은 다음 메시지와 API를 이미 사용한다.

- `product_candidate`: 온채널 후보의 기존 entity type
- `market_research`: 네이버 조사
- `product_decision`: 사람 확인과 승인 결정
- `room_context`: 선택 메시지 묶음
- `ref_ids`: 메시지 간 연결
- `metadata`: 도메인별 구조화 필드

새 아키텍처는 기존 운영 데이터를 깨지 않도록 append-only로 확장한다. `product_candidate`를 즉시 `supplier_candidate`로 일괄 변경하지 않는다. 새 캡처부터 `supplier_candidate`를 사용할지는 API와 확장 프로그램을 함께 업데이트한 뒤 결정한다.

## 8. 구현 순서

1. AI 상품 추천 메시지 생성과 추천 View를 추가한다.
2. 공급처 캡처 전에 추천 메시지를 선택하여 `ref_ids`로 연결한다.
3. 네이버 시장조사 캡처에 공급처 후보 메시지 ID를 연결한다.
4. 검증방의 `validation_decision`과 `pass/hold/reject`를 구조화한다.
5. 콘텐츠 작업 메시지와 상품명·썸네일·이미지 결과물 계약을 추가한다.
6. 승인 결정과 판매 시작 메시지를 분리한다.
7. CoreHub 이벤트를 HajunAI Message로 기록하고 상태 View를 만든다.
8. 기존 네 방을 새 메시지 View로 점진적으로 정리한다.

## 9. 변경 금지 원칙

- 방을 원본 데이터베이스처럼 사용하지 않는다.
- 상품 단계별 별도 원본 테이블을 먼저 만들지 않는다.
- AI 추천만으로 승인하지 않는다.
- 네이버 결과만으로 동일상품을 확정하지 않는다.
- 기존 메시지를 수정·삭제하지 않는다.
- CoreHub가 HajunAI 원문을 소유하지 않는다.
- 콘텐츠 제작 완료를 판매 승인으로 취급하지 않는다.
- 승인 완료를 판매 시작으로 취급하지 않는다.
- 외부 쇼핑몰 등록은 명시적 실행과 최종 확인 없이 자동화하지 않는다.

## References

[1]: https://hajuncore-app.vercel.app "HajunCore 운영 앱"
[2]: https://github.com/sykim-stack/hajuncore-app "HajunCore 애플리케이션 저장소"
[3]: https://github.com/sykim-stack/brainpool-core-final "BRAINPOOL Core 확장 프로그램 저장소"
