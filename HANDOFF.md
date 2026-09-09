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
