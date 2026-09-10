# Manus 2 상품검증 워크플로 인수인계

> **목적:** Manus 2가 현재 상품검증 기능의 설계, 구현 상태, 운영 규칙, 남은 작업을 즉시 이해하고 이어서 개발할 수 있도록 한다.
> **작성 기준:** 2026-09-11
> **기준 브랜치:** `master`
> **정식 저장소:** `sykim-stack/hajuncore-app`, `sykim-stack/brainpool-core-final`

## 1. 먼저 읽고 동기화할 것

각 저장소에서 작업 전에 다음 명령을 실행한다.

```bash
git switch master
git fetch origin
git pull --ff-only origin master
git status --short --branch
```

현재 확인된 최신 커밋은 다음과 같다.

| 저장소 | 최신 커밋 | 의미 |
|---|---:|---|
| `hajuncore-app` | `5be77ce` | 메시지별 원문 복사 버튼 추가 |
| `brainpool-core-final` | `809f2bf` | 네이버 쇼핑 도메인 권한 추가 |

`hajuncore-app`은 HajunAI 웹 애플리케이션이다. `brainpool-core-final`은 BRAINPOOL Core Chrome 확장 프로그램이다. 두 저장소를 혼동하지 않는다.

## 2. 핵심 설계 결론

상품검증마당은 상품별 방을 자동 생성하는 구조가 아니다. 기존 HajunAI의 하나의 마당 안에서 단계별 방이 역할을 나눈다.

```text
상품검증마당
├── 상품발굴방
├── 시장조사방
├── 검증방
└── 승인상품방
```

전체 목표 흐름은 다음과 같다.

```text
온채널 상품 수동 캡처
        ↓
상품발굴방: 원본 후보 저장
        ↓
네이버 수동 시장조사
        ↓
시장조사방: 시장 데이터 저장
        ↓
검증방: 원문과 조사 결과를 비교·분석
        ↓
사람 최종 확인
        ↓
승인상품방: 운영 대상 보관
```

현재 구현은 완전 자동 파이프라인이 아니다. 각 단계는 메시지와 `ref_ids`로 연결되고, 사람의 확인을 거쳐야 한다. 특히 AI 분석만으로 상품을 승인하거나 네이버 검색 결과만으로 온채널 상품과 동일하다고 확정하지 않는다.

## 3. 방별 역할과 현재 상태

| 방 | 공식 역할 | 저장되는 자료 | 현재 상태 |
|---|---|---|---|
| 상품발굴방 `product_discovery` | 온채널 상품 후보의 최초 원문 저장 | 상품명, 온채널 코드, 가격, URL, 원문 | 구현됨 |
| 시장조사방 `market_research` | 네이버 검색·상품 페이지 조사 이력 저장 | 가격, 리뷰, 평점, 키워드, URL, 원문 | 수동 extractor 구현됨 |
| 검증방 `product_validation` | 후보와 시장조사 자료의 비교·분석 | 계산, 판단, AI 분석, 사람 의견 | 방과 참조 흐름 구현됨 |
| 승인상품방 `approved_products` | 사람 최종 확인이 끝난 운영 대상 보관 | 최종 결정과 연결된 상품 기록 | 방은 존재하나 자동 승격은 미구현 |

### 상품발굴방

온채널 상세페이지에서 사용자가 확장 프로그램의 캡처 버튼을 눌렀을 때 저장된다. 식별자는 온채널 상품코드로 만든다.

```text
source = onchannel
source_product_code = CH2409972
internal_code = onchannel:CH2409972
entity_type = product_candidate
```

`CH`로 시작하는 상품코드를 찾지 못하면 저장하지 않는다. 온채널 목록 페이지나 상품코드가 본문에 노출되지 않는 페이지에서는 이 오류가 정상적으로 발생할 수 있다.

같은 `internal_code`가 이미 있으면 원문을 다시 복제하지 않는다. 기존 대표 원문 메시지를 반환하고, 기존 원문은 수정·삭제하지 않는다.

### 시장조사방

네이버 검색·상품 페이지에서 사용자가 수동 캡처할 때 저장된다. 네이버 상품번호가 있으면 상품번호를 사용하고, 검색 결과처럼 고정 상품번호가 없으면 검색어를 사용한다.

```text
entity_type = market_research
source = naver
internal_code = naver:{source_product_code}
```

예시는 다음과 같다.

```text
naver:1234567890
naver:search:자동차 번호판
```

검색어 기반 식별자는 조사 이력 식별자일 뿐이다. 온채널 상품과 같은 상품이라고 자동 확정하지 않는다.

현재 네이버 검색 페이지에서 보존하는 주요 항목은 상품명, 가격, 리뷰 수·평점, 키워드, 검색어, 원문 URL, 대표 이미지, 최대 20,000자의 본문이다.

### 검증방

검증방은 원문을 복제하는 곳이 아니다. 상품발굴방 원문과 시장조사방 조사 메시지를 `ref_ids`로 참조하여 검증 결과를 기록한다.

```json
{
  "msg_type": "understanding",
  "ref_ids": [
    "온채널 원문 메시지 ID",
    "네이버 조사 메시지 ID"
  ]
}
```

검증 내용에는 원가·판매가·배송비·마진, 경쟁 상품, 리뷰, 키워드, 상품명, 이미지, 정책 위험, AI 분석 결과를 포함할 수 있다.

### 승인상품방

승인상품방은 사람의 최종 확인이 끝난 상품을 운영 대상으로 모으는 방이다. 현재는 방과 사람 확인 메시지 흐름까지 구현되어 있으나, `confirmed` 결정이 자동으로 승인상품방에 새 기록을 생성하는 승격 기능은 아직 구현하지 않았다.

## 4. 메시지·식별자·상태 계약

### 원본 저장소

상품 원문과 검증 이력의 공식 저장소는 `hajun_messages`다. `hajun_posts`에 새 상품 원문을 저장하지 않는다. 별도의 `products` 원본 테이블도 만들지 않는다.

### 식별자

기본 계약은 다음과 같다.

```text
internal_code = source + ":" + source_product_code
```

### 상태

```text
캡처 → 검토 대기
AI 생성 → adopted 성격의 검토 대기
사람 확인 → confirmed decision
```

AI 분석은 판매 승인과 다르다. 사람의 확정 전에는 CoreHub 운영 데이터로 이관하지 않는다. 사람 확인은 기존 원문이나 AI 메시지를 수정하지 않고 새 `product_decision` 메시지를 append한다.

### 맥락 저장

메시지가 많이 쌓이는 방에서는 필요한 메시지를 여러 개 선택하여 하나의 맥락 메시지로 저장할 수 있다.

- UI: `선택 맥락 저장`
- 새 메시지 유형: `understanding`
- metadata: `entity_type=room_context`
- 원문 연결: `ref_ids`
- 원문 삭제·수정·복제: 하지 않음

## 5. 현재 구현된 API와 UI

### 주요 API

```text
GET  /api/hajun?action=yard_list
GET  /api/hajun?action=room_list&yard=product_validation
POST /api/hajun?action=post_message
GET  /api/hajun?action=product_candidates
GET  /api/hajun?action=product_random
GET  /api/hajun?action=product_timeline&internal_code={code}
POST /api/hajun?action=confirm_product
```

`post_message`는 메시지 본문, `ref_ids`, 선택적 `metadata`를 저장한다. 상품 후보 조회는 `metadata.entity_type=product_candidate`인 메시지만 읽는다.

### 현재 웹 UI

방 화면에는 다음 기능이 있다.

- 1,200자 초과 메시지의 `펼치기/접기`
- 각 메시지의 `복사` 버튼
- 방 전체의 `방 전체 복사` 버튼
- 여러 메시지를 선택하는 참조 UI
- `선택 맥락 저장`
- 상품 후보의 `검토 대기`, `확인됨` 상태 표시
- 상품 후보의 `사람 확인` 버튼

메시지별 복사는 접힌 상태에서도 전체 원문을 클립보드에 복사한다. 방 전체 복사는 작성자, 유형, 시각, 원문, 참조 ID를 Markdown 형태로 복사한다.

## 6. 확장 프로그램의 현재 흐름

`brainpool-core-final`은 자동 수집기가 아니다. 사용자가 현재 탭을 열고 팝업의 캡처 버튼을 눌렀을 때만 동작한다.

```text
팝업 캡처 버튼
  → background.js
  → 현재 탭 content/product-content.js
  → 온채널 또는 네이버 데이터 추출
  → HajunCore API
  → 선택한 마당·방의 hajun_messages 저장
```

온채널 페이지는 `CH` 상품코드가 필요하다. 네이버 페이지는 `market_research`로 저장되며 온채널 후보 중복 판정과 별도 흐름이다.

네이버 쇼핑 권한은 `manifest.json`에 다음 도메인으로 명시되어 있다.

```text
https://search.shopping.naver.com/*
https://shopping.naver.com/*
https://msearch.shopping.naver.com/*
```

Chrome에서 소스가 바뀐 뒤에는 반드시 `chrome://extensions`에서 확장 프로그램을 새로고침하고, 기존 네이버 탭도 새로고침해야 한다. Chrome이 GitHub에서 동기화한 폴더가 아닌 다른 복사본을 로드하고 있지 않은지 확인한다.

## 7. 확인된 운영 방과 URL

운영 앱:

```text
https://hajuncore-app.vercel.app
```

운영 API의 상품검증마당에는 다음 방이 확인되어 있다.

```text
product_discovery
market_research
product_validation
approved_products
```

상품발굴방 화면 예시는 다음 경로다.

```text
/hajun/product_validation/product_discovery
```

## 8. 검증된 내용

현재까지 다음 검증이 통과되었다.

- `npm run test:product-validation`: 6개 통과
- `npm run build`: 통과
- `git diff --check`: 통과
- 코어 파이널 JavaScript 문법 검사: 통과
- 코어 파이널 `manifest.json` JSON 파싱: 통과
- 운영 `room_list` 호출: 상품검증마당과 4개 방 확인
- 운영 기존 상품 후보 조회: 응답 확인

권장 검증 명령은 다음과 같다.

```bash
cd /home/ubuntu/hajun-ai
npm run test:product-validation
npm run build
git diff --check

cd /home/ubuntu/brainpool-core-final
node --check background.js
node --check content.js
node --check content/product-content.js
node --check popup/popup.js
node -e 'JSON.parse(require("fs").readFileSync("manifest.json","utf8")); console.log("manifest ok")'
git diff --check
```

## 9. 현재 남은 작업

우선순위가 높은 남은 작업은 다음과 같다.

1. **Chrome 실사용 검증:** 최신 `brainpool-core-final`을 로드하고 네이버 쇼핑 검색·상품 페이지에서 시장조사방 저장을 확인한다.
2. **운영 배포 확인:** Vercel에 `hajuncore-app` 최신 `master`가 배포되었는지 확인한다.
3. **검증방 연결 UI:** 상품발굴방 원문과 시장조사방 조사 결과를 선택하여 검증방에 참조 메시지를 만드는 흐름을 명시적으로 제공한다.
4. **승인상품 승격:** 사람이 확인한 `product_decision`을 승인상품방에 append하는 명시적 액션을 추가한다. 자동 승인과 구분해야 한다.
5. **시장조사 식별 연결:** 네이버 검색 결과의 여러 상품을 개별 상품 단위로 저장할 필요가 있는지 결정한다. 현재 구현은 페이지 전체를 하나의 조사 메시지로 저장한다.
6. **상품 후보 상태 모델:** `adopted`, `confirmed`, `rejected` 등 상태를 확장할 경우 기존 append-only 원칙과 API 계약을 먼저 갱신한다.
7. **migration 운영 이력:** `supabase/migrations/20260909_product_validation_metadata.sql`의 운영 적용 이력을 실제 배포 기록에 명확히 남긴다.

## 10. 하지 말아야 할 변경

다음 변경은 별도 설계 합의 없이 하지 않는다.

- 상품별 방 자동 생성
- `hajun_messages`와 `hajun_posts`의 원문 이중 저장
- AI 분석만으로 승인상품방 등록
- 네이버 결과와 온채널 후보의 자동 동일상품 확정
- 로그인 자격증명 저장
- 대량 자동 수집이나 자동 로그인
- 기존 원문 메시지 수정·삭제
- `products` 테이블을 원본 저장소로 선행 도입
- `master`가 아닌 다른 브랜치를 기준으로 작업

## 11. 다음 담당자가 바로 할 일

다음 담당자는 아래 순서로 시작한다.

1. 두 저장소를 `master`와 동기화한다.
2. `HANDOFF.md`, 이 문서, `docs/HAJUNAI_PRODUCT_EXTENSION_CONTRACT.md`를 읽는다.
3. `hajuncore-app`에서 테스트와 빌드를 실행한다.
4. `brainpool-core-final`의 `manifest.json`과 `content/product-content.js`가 최신인지 확인한다.
5. Chrome 확장 프로그램이 올바른 로컬 폴더를 로드하는지 확인한다.
6. 네이버 쇼핑 검색 페이지를 새로고침한 뒤 `상품검증마당 → 시장조사방`을 선택하여 캡처한다.
7. 팝업에 `시장조사 저장 완료`와 `Message ID`가 표시되는지 확인한다.
8. 운영 시장조사방에서 저장된 `market_research` 메시지를 확인한다.
9. 결과와 오류를 이 문서의 작업 로그에 남긴다.

## References

[1]: https://hajuncore-app.vercel.app "HajunCore 운영 앱"
[2]: https://github.com/sykim-stack/hajuncore-app "HajunCore 애플리케이션 저장소"
[3]: https://github.com/sykim-stack/brainpool-core-final "BRAINPOOL Core 확장 프로그램 저장소"

## 작업 로그

### 작업 로그: 2026-09-11 02:36

- 담당: Manus
- 작업: Manus 2 인계용 상품검증 워크플로 문서 작성
- 변경 파일: `docs/MANUS2_HANDOFF_PRODUCT_WORKFLOW.md`
- 결정: 4개 방의 역할을 원본 저장, 시장조사, 검증, 승인 보관으로 구분하고 현재 자동화 수준과 미구현 승격 단계를 명시했다.
- 검증: 문서 작성 완료. 코드 변경은 포함하지 않았다.
- 다음 작업: Manus 2는 Chrome 실사용 저장 흐름을 먼저 검증한 뒤 검증방 연결과 승인상품 승격을 구현한다.
- 주의: 자동 승인, 자동 동일상품 확정, 원문 이중 저장을 추가하지 않는다.
