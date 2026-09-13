# HajunAI 상품등록 계약 (상품검증 확장)

## 목적

검증 `pass` 상품을 쇼핑몰에 올리기 위한 콘텐츠 제작·게시 구간을 정의한다.
상품검증마당의 판정과 상품등록마당의 작업을 분리하고, Message Graph를 `ref_ids`로 끊기지 않게 이어 간다.

운영 DB는 기존과 동일하다. Supabase **Jena-Voca-01** (`grlfocvlfatuvphkyivd`).

## 공간 계약

```text
상품검증마당 (product_validation)
        ↓ decision=pass
상품등록마당 (product_listing)
```

### 상품등록마당 방

| 역할 | key | 메시지 |
|---|---|---|
| 등록 대기 | `listing_queue` | 검증 pass 후 대기열 (`listing_draft`) |
| 콘텐츠 제작 | `listing_content` | 상품명·섬네일·상세 작업 이력 (`listing_content`) |
| 등록 완료 | `listing_published` | 쇼핑몰 게시 완료 (`listing_published`) |

`approved_products`는 검증 통과 아카이브로 유지한다. 등록 작업방으로 쓰지 않는다.

## Message Graph

```text
product_candidate
      ↓
market_research
      ↓
product_validation_decision   (pass | hold | reject)
      ↓ (pass only)
listing_draft
      ↓
listing_content
      ↓
listing_published
```

원문은 복제하지 않는다. 각 단계는 `ref_ids`로만 연결한다.

## entity_type

| entity_type | 방 | 설명 |
|---|---|---|
| `listing_draft` | `listing_queue` | pass 직후 등록 대기 |
| `listing_content` | `listing_content` | 상품명/섬네일/상세 작업 이력 |
| `listing_published` | `listing_published` | 쇼핑몰 게시 완료 |

## status

```text
draft | editing | ready | published | hold
```

## 검증 pass → listing_draft

사람이 검증방에 `msg_type=decision`, `metadata.decision=pass`를 저장하면
시스템은 같은 요청 처리 안에서 등록대기방에 `listing_draft`를 1개 생성한다.

규칙:
- `decision`이 `pass`일 때만 생성
- `hold` / `reject`는 listing을 만들지 않음
- 동일 `internal_code`에 이미 열린 `listing_draft`(status != published)가 있으면 새로 만들지 않음
- 원문 content를 복사하지 않음
- `ref_ids` = `[decision_message_id, ...decision.ref_ids]`

## API

```text
POST /api/hajun?action=post_message
GET  /api/hajun?action=listing_queue
GET  /api/hajun?action=listing_timeline&internal_code=...
GET  /api/hajun?action=yard_list
```

## 금지

- 쇼핑몰 API 자동 게시
- AI만으로 `published` 처리
- 원문 복제
- CoreHub 자동 이관
- 상품별 방 생성
- 축소 배포로 yard/product action 차단
