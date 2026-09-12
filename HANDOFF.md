# HajunAI 작업 인수인계

> **목적:** Manus 1과 Manus 2가 하준아이 작업을 중단 지점에서 이어서 수행하기 위한 단일 진입 문서
> **기준 브랜치:** `master`
> **갱신일:** 2026-09-09

## 시작 전에 반드시 확인할 것

```bash
git switch master
git fetch origin
git pull --ff-only origin master
git status --short --branch
```

다음 문서를 순서대로 읽는다.

1. `HANDOFF.md`
2. `docs/HAJUNAI_CURRENT_STATUS.md`
3. `docs/HAJUNAI_CONTEXT_POLICY.md`
4. `docs/HAJUNAI_PRODUCT_VALIDATION_DECISIONS.md`
5. 관련 코드와 테스트 결과

작업 중에는 `master`에 직접 작업한다. 다른 브랜치나 `main`을 기준으로 삼지 않는다. 작업이 멈추기 전에 이 문서의 **현재 작업 상태**, **완료한 작업**, **다음 작업**, **검증 결과**를 갱신한다.

## 확정된 방향

### HajunAI 기본 공간

```text
하준아이 → 마당 → 거실 → 방
```

상품검증도 별도 앱이나 상품별 방이 아니라 기존 HajunAI 공간 흐름을 사용한다.

### 상품검증의 원본

```text
상품 원문·검증 이력 = hajun_messages
hajun_posts = 기존 엔진방 참고용 읽기 자료
```

새 상품 원문을 `hajun_posts`에 저장하거나 두 테이블에 자동 복제하지 않는다. 기존 포스트는 당분간 참고할 수 있지만 추후 정리 대상이다.

### 상품검증 MVP 범위

이번 단계에서는 다음만 만든다.

- 상품 식별 코드 확인
- 중복 후보 확인
- 원문 메시지 저장
- 기존 메시지 `ref_ids` 연결
- 기본 검증·분석 로직
- 마당·거실·방 화면 흐름
- 테스트와 검증 로그

이번 단계에서는 다음을 만들지 않는다.

- 별도 `products` 중심 DB
- 상품별 방 자동 생성
- 카페24 자동 등록
- CoreHub 자동 이관
- AI 결과만으로 판매 승인
- 네이버 결과의 동일상품 자동 확정
- 대량 자동 수집·자동 로그인

### 상태와 승인

```text
AI 생성 → 검토 대기(adopted) → 사람 확인 → confirmed
```

AI 분석은 판매 승인과 다르다. 사람의 확정 전에는 CoreHub 운영 데이터로 이관하지 않는다.

## 현재 구현 상태

- HajunAI 마당·거실·방 라우트: 구현됨
- 관제마당·개발마당·브라이언풀마당 조회: 구현됨
- 관제·개발 하준챗: 구현됨
- 세 마당 명시적 컨텍스트 조회: 구현됨
- `context_package`: 폐기 안내만 반환
- `/api/docs?agent=clo2|clo3|pm`: 명시적 문서 조회
- 확장 프로그램 역방향 맥락 주입: 구현됨
- 상품검증 기능: **설계 결정 단계, 본격 구현 전**
- `adopted/confirmed` 필드·확인 UI·승격 API: **미구현**
- `hajun_messages.metadata`: **스키마 확인·결정 필요**

## 상품검증 다음 작업

1. 기존 DB에서 상품검증마당과 방 key 충돌 여부 확인
2. `hajun_messages`의 실제 컬럼과 metadata 저장 가능 여부 확인
3. 상품 식별 계약 확정: `source + source_product_code`
4. `post_message`가 metadata와 ref_ids를 안전하게 받도록 테스트
5. 읽기 전용 `product_candidates` 조회 로직 구현
6. 중복 후보 판정 테스트 구현
7. 랜덤 검증은 후보 메시지 ID를 선택하고 원문을 복제하지 않도록 구현
8. 방 AI 분석 요청에 원본 메시지 ID를 `ref_ids`로 전달
9. 마당 → 거실 → 방 UI에서 상품검증 기록을 확인
10. 온채널·네이버 확장 추출기는 위 계약이 통과한 뒤 시작

## 중단 시 기록 규칙

작업을 멈출 때 아래 형식으로 이 문서를 갱신한다.

```markdown
### 작업 로그: YYYY-MM-DD HH:MM
- 담당: Manus 1 또는 Manus 2
- 작업: 무엇을 했는가
- 변경 파일: 경로 목록
- 결정: 새로 확정된 사항 또는 미결 사항
- 검증: 실행한 명령과 결과
- 다음 작업: 다음 담당자가 바로 실행할 한 가지
- 주의: 되돌리면 안 되는 계약 또는 알려진 문제
```

커밋 메시지는 작업 목적을 드러내게 작성한다. 커밋 전에는 `npm run build`와 `git diff --check`를 실행한다. 외부 서비스가 필요한 검증은 응답·시각·오류를 작업 로그에 남긴다.

## 현재 작업 로그

### 작업 로그: 2026-09-09 09:20
- 담당: Manus 2
- 작업: 상품검증 MVP의 원본·중복 방지 방향과 Manus 1·2 인수인계 체계를 확정
- 변경 파일: `HANDOFF.md`, `docs/HAJUNAI_PRODUCT_VALIDATION_DECISIONS.md`, `AGENTS.md`
- 결정: `hajun_messages`를 상품검증 원본으로 사용하고 `hajun_posts`는 레거시 참고용 읽기 전용으로 유지; 기본 흐름은 `마당 → 거실 → 방`
- 검증: 기존 master 빌드 통과, 세 마당 API 조회 통과, 폐기 API 안내 통과, 확장 프로그램 문법 검증 통과
- 다음 작업: DB 스키마와 기존 마당 key를 먼저 확인한 뒤 상품검증 MVP의 읽기·중복 판정 테스트를 추가
- 주의: 상품별 방·별도 products 테이블·두 원본 자동 복제를 만들지 않음

### 작업 로그: 2026-09-09 09:24
- 담당: Manus 2
- 작업: 상품 후보 식별·중복 판정의 순수 모듈과 자동 테스트 추가
- 변경 파일: `lib/productValidation.ts`, `lib/productValidation.test.ts`, `package.json`
- 결정: `internal_code = source:source_product_code`; 중복 후보는 대표 원문 ID 하나만 선택하며 원문을 복제하지 않음
- 검증: `npm run test:product-validation` 5개 통과, `git diff --check` 통과
- 다음 작업: 실제 `hajun_messages` 컬럼과 상품검증마당·방 key를 DB에서 확인한 뒤 API 연결
- 주의: 현재 모듈은 순수 로직만 제공하며 DB 저장·상품검증마당 시드는 아직 추가하지 않음

### 작업 로그: 2026-09-09 09:35
- 담당: Manus 2
- 작업: `hajun_messages` 기반 상품 후보 조회·타임라인·랜덤 선택 API 추가
- 변경 파일: `app/api/hajun/route.ts`, `types/hajun.ts`
- 결정: `metadata.entity_type=product_candidate`인 메시지만 후보로 읽고, 소스 원문은 `hajun_messages`에 남김; API는 조회 전용이며 상품 복제·자동 저장을 하지 않음
- API: `GET /api/hajun?action=product_candidates`, `product_random`, `product_timeline`
- 검증: `npm run build` 통과, `npm run test:product-validation` 5개 통과, `git diff --check` 통과
- 다음 작업: 실제 DB의 metadata 컬럼 유무와 상품검증마당·방 key를 확인하고 캡처 저장 계약을 연결
- 주의: 현재 DB에 `metadata` 컬럼이 없으면 후보 목록은 빈 목록을 반환하며 기존 메시지 조회는 유지됨

### 작업 로그: 2026-09-09 10:03
- 담당: Manus 2
- 작업: `brainpool-core-final`과 상품검증 공통 연동 계약을 맞추고 코어 파이널을 원격 `master`와 동기화
- 변경 파일: `docs/HAJUNAI_PRODUCT_EXTENSION_CONTRACT.md`, 코어 파이널 `HANDOFF.md`, `hajunai-api-spec.json`
- 결정: 두 저장소 모두 `master` 기준; 확장 프로그램은 수동 캡처만 담당하고 상품 원본·중복 판정·이력은 HajunAI `hajun_messages`가 담당
- 검증: 코어 파이널 로컬을 원격 `4b5d4e8`까지 fast-forward; 공통 API·payload 계약 문서화
- 다음 작업: HajunAI DB의 `metadata` 컬럼과 상품검증마당·방 key를 확인한 뒤 양쪽 캡처 저장 API를 연결
- 주의: 저장 계약 확정 전 온채널·네이버 추출기를 먼저 구현하지 않음

### 작업 로그: 2026-09-09 10:06
- 담당: Manus 2
- 작업: 양쪽 저장 계약의 첫 구현으로 `hajun_messages.metadata` 저장 지원과 코어 파이널 캡처 전달 action 추가
- 변경 파일: `app/api/hajun/route.ts`, `supabase/migrations/20260909_product_validation_metadata.sql`, 코어 파이널 `background.js`
- 결정: metadata는 선택 필드로만 저장하며, 상품 캡처는 `entity_type=product_candidate`와 `internal_code`를 필수로 한다
- 검증: 배포 API에서 기존 메시지에 metadata가 아직 노출되지 않음을 확인; 마이그레이션은 아직 외부 DB에 적용하지 않음
- 다음 작업: Supabase에 migration 적용 후 `POST_HAJUN_PRODUCT_CAPTURE`를 실제 상품검증 방 선택 UI와 연결
- 주의: migration 적용 전에는 상품 캡처 action을 호출하지 않음; 현재 배포에는 metadata 저장 계약이 아직 활성화되지 않음

### 작업 로그: 2026-09-10 15:01
- 담당: Manus 2
- 작업: 운영 배포와 코어 파이널 최신 `master`를 교차 검증하고 양쪽 상태를 정렬
- 결과: 운영 API에서 `product_validation` 마당과 4개 기능방 확인; `product_candidates` 5건과 `product_random` 응답 확인
- 코어 파이널: 원격 `master=0f717b5`에서 온채널 수동 캡처·중복 방지·message ID 표시 구현 확인
- 검증: 운영 `room_list`, `product_candidates`, `product_random` 호출; 코어 파이널 JS 문법 4개 통과
- 다음 작업: 실제 Chrome 온채널 상세페이지 캡처를 실행해 저장·중복 결과를 확인
- 주의: 네이버 조사 extractor와 승인상품 승격은 아직 미구현이며, 운영 캡처는 수동 테스트 범위로 제한

### 작업 로그: 2026-09-10 17:31
- 담당: Manus 2
- 작업: 방 메시지 접기·펼치기 UI 복원
- 변경 파일: `app/hajun/[yard]/[room]/page.tsx`
- 결정: 1,200자 초과 원문은 기본 접고 `펼치기/접기` 버튼으로 전체 내용을 확인하도록 함
- 검증: `npm run build`, `npm run test:product-validation` 5개 통과, `git diff --check` 통과
- 다음 작업: 배포 후 상품발굴방의 긴 원문과 일반 메시지에서 접기 동작 확인
- 주의: 접힘 상태는 현재 방을 다시 로드하면 긴 메시지 기준으로 초기화됨

### 작업 로그: 2026-09-10 23:58
- 담당: Manus
- 작업: 네이버 시장조사 메시지 계약과 사람 확인 흐름을 구현하고 두 정식 저장소의 구현 범위를 정렬
- 변경 파일: `app/api/hajun/route.ts`, `app/hajun/[yard]/[room]/page.tsx`, `lib/productValidation.ts`, `lib/productValidation.test.ts`, `docs/HAJUNAI_PRODUCT_EXTENSION_CONTRACT.md`
- 결정: 네이버 시장조사는 `metadata.entity_type=market_research`와 `internal_code=naver:source_product_code`로 `hajun_messages`에 저장하며, 현재 열린 페이지에서 사용자가 수동 캡처한 경우에만 처리한다. 사람 확인은 원문을 수정하지 않고 `product_decision` 메시지를 append한다.
- 검증: `npm run test:product-validation` 6개 통과, `npm run build` 통과, `git diff --check` 통과
- 다음 작업: 코어 파이널 확장 프로그램을 Chrome에서 새로고침한 뒤 네이버 검색·상품 페이지 수동 캡처와 운영 방 저장 결과를 실제 확인
- 주의: 네이버 검색어 기반 식별자는 조사 이력용이며 온채널 상품과의 동일상품을 자동 확정하지 않는다. Chrome 실사용 테스트와 운영 배포는 아직 남아 있다.

### 작업 로그: 2026-09-11 00:34
- 담당: Manus
- 작업: 방 전체 메시지를 Markdown 텍스트로 클립보드에 복사하는 UI 추가
- 변경 파일: `app/hajun/[yard]/[room]/page.tsx`
- 결정: 현재 방의 전체 메시지를 작성자·유형·시각·원문·참조 ID와 함께 한 번에 복사하며, Clipboard API 실패 시 브라우저 fallback을 사용한다.
- 검증: `npm run test:product-validation`, `npm run build`, `git diff --check` 실행 예정
- 다음 작업: 배포 후 상품발굴방에서 `방 전체 복사` 버튼과 클립보드 결과 확인
- 주의: 브라우저 클립보드 권한이 차단된 환경에서는 복사가 실패할 수 있으며 상태 문구로 알린다.

### 작업 로그: 2026-09-11 00:40
- 담당: Manus
- 작업: 누적 메시지 중 선택한 여러 메시지를 하나의 맥락 기록으로 저장하는 UI 추가
- 변경 파일: `app/hajun/[yard]/[room]/page.tsx`
- 결정: 선택한 메시지를 새 원문으로 복제하지 않고 `understanding` 메시지의 `ref_ids`와 `metadata.entity_type=room_context`로 묶는다. 맥락 이름은 사용자가 입력하거나 기본값을 사용한다.
- 검증: `npm run test:product-validation`, `npm run build`, `git diff --check` 실행 예정
- 다음 작업: 배포 후 방에서 여러 메시지 선택 → 맥락 이름 입력 → `선택 맥락 저장` → 참조 연결 표시 확인
- 주의: 맥락 저장은 원문을 요약·삭제하지 않으며, 원문 메시지는 계속 방에 남는다.

### 작업 로그: 2026-09-11 00:45
- 담당: Manus
- 작업: 각 메시지의 `펼치기` 옆에 전체 원문 `복사` 버튼 추가
- 변경 파일: `app/hajun/[yard]/[room]/page.tsx`
- 결정: 접힌 긴 메시지도 화면에 보이는 일부가 아니라 전체 원문을 작성자·유형·시각과 함께 복사한다.
- 검증: `npm run test:product-validation`, `npm run build`, `git diff --check` 실행 예정
- 다음 작업: 배포 후 네이버 시장조사 메시지에서 `펼치기` 옆 `복사` 버튼을 눌러 전체 원문 확인
- 주의: 브라우저 클립보드 권한이 막히면 fallback 복사를 시도하고 실패 문구를 표시한다.

### 작업 로그: 2026-09-11 10:26
- 담당: Manus
- 작업: 상품검증 남은 핵심 흐름인 검증방 연결과 승인상품방 승격 구현
- 변경 파일: `app/api/hajun/route.ts`, `app/hajun/[yard]/[room]/page.tsx`, `docs/MANUS2_HANDOFF_PRODUCT_WORKFLOW.md`
- 결정: 선택 메시지는 `POST /api/hajun?action=save_validation_context`로 검증방에 `ref_ids`를 가진 `validation_record` 메시지로 append한다. 사람 확인된 후보만 `POST /api/hajun?action=promote_product`로 승인상품방에 `product_decision=approved` 메시지를 append한다.
- 검증: `npm run test:product-validation` 6개 통과, `npm run build` 통과, `git diff --check` 통과
- 다음 작업: 배포 후 검증방 기록과 승인상품방 승격을 운영 UI에서 실제 확인
- 주의: 원문 수정·삭제·이중 복제 금지; AI 결과와 네이버 조사만으로 승인하지 않음

### 작업 로그: 2026-09-12 10:12
- 담당: Manus
- 작업: 상품 운영 V2를 방 중심이 아닌 HajunAI Message 중심의 이벤트 흐름으로 재정의
- 변경 파일: `docs/PRODUCT_WORKFLOW_V2_PROPOSAL.md`, `docs/PRODUCT_WORKFLOW_MESSAGE_ARCHITECTURE.md`
- 결정: 방은 View이고 `hajun_messages`가 원본 사건 기록이다. 추천·공급처 후보·시장조사·검증·콘텐츠·승인·판매 시작은 Message graph로 `ref_ids` 연결한다. CoreHub 분석·상태 변화는 `corehub_event` Message로 남기며 오늘의 발견은 이벤트 상태 View로 표현한다.
- 검증: 문서 diff check 예정; 코드 변경은 포함하지 않음
- 다음 작업: AI 추천 Message와 추천 View부터 구현하고 공급처 캡처 시 추천 메시지 ref 연결을 추가한다.
- 주의: 단계별 별도 원본 DB를 만들지 않으며, 기존 `product_candidate` 운영 데이터는 일괄 변경하지 않는다.

### 작업 로그: 2026-09-12 10:23
- 담당: Manus
- 작업: Message 중심 상품 운영의 첫 실제 기능으로 상품발굴방에 AI 상품 추천 Message 생성 추가
- 변경 파일: `app/api/hajun/route.ts`, `app/hajun/[yard]/[room]/page.tsx`, `docs/PRODUCT_WORKFLOW_MESSAGE_ARCHITECTURE.md`
- 결정: 사용자가 현재 조건을 입력하면 `recommend_product` API가 AI 추천을 생성하고 `metadata.entity_type=product_recommendation`, `msg_type=work_result`로 현재 상품발굴방에 append한다. 추천은 공급처 후보나 승인상품이 아니다.
- 검증: `npm run test:product-validation` 6개 통과, `npm run build` 통과, `git diff --check` 통과
- 다음 작업: 추천 Message를 선택한 뒤 온채널 후보 캡처에 `ref_ids`로 연결한다.
- 주의: AI 추천만으로 승인하지 않으며, 추천 결과는 사람의 공급처 검색을 시작하기 위한 제안이다.

### 작업 로그: 2026-09-12 10:56
- 담당: Manus
- 작업: BRAINPOOL Core 팝업에서 AI 추천 Message를 선택하고 온채널 공급처 후보 캡처에 `ref_ids`로 연결
- 변경 파일: `app/api/hajun/route.ts`, `brainpool-core-final/background.js`, `brainpool-core-final/popup/popup.html`, `brainpool-core-final/popup/popup.js`
- 결정: 추천 목록은 `recommendations?room_id=` API로 읽고, 캡처 시 선택된 추천 ID를 후보 Message의 `ref_ids`에 넣는다. 추천 선택은 선택사항이며 미선택 캡처도 기존처럼 동작한다.
- 검증: 하준코어 상품검증 테스트 6개 통과, 하준코어 build 통과, 확장 프로그램 JS·manifest 문법 통과
- 다음 작업: 네이버 시장조사 캡처에도 선택된 공급처 후보 ID를 연결한다.
- 주의: 후보 캡처는 추천을 승인으로 바꾸지 않으며, 동일상품·품질·판매 가능성 판단은 검증 단계에서 사람이 결정한다.

### 작업 로그: 2026-09-12 11:07
- 담당: Manus
- 작업: 네이버 시장조사 캡처에 연결할 공급처 후보를 선택하고 조사 Message에 후보 ID를 `ref_ids`로 연결
- 변경 파일: `app/api/hajun/route.ts`, `brainpool-core-final/background.js`, `brainpool-core-final/popup/popup.html`, `brainpool-core-final/popup/popup.js`
- 결정: 팝업에서 시장조사방을 선택하면 상품발굴방의 공급처 후보 목록을 조회한다. 네이버 캡처 시 선택된 후보만 조사 Message의 참조로 저장하며, 미선택 캡처도 허용한다.
- 검증: 하준코어 상품검증 테스트 6개 통과, 하준코어 build 통과, 확장 프로그램 JS·manifest 문법 통과
- 다음 작업: 발굴·시장조사 메시지를 검증 결정 Message로 묶고 `pass/hold/reject`를 구조화한다.
- 주의: 네이버 조사 결과만으로 동일상품 확정·승인하지 않는다.
