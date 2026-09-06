# 하준아이(HajunAI) 현재 완성 현황

> **문서 목적:** 하준아이 작업을 클로1 총괄이 빠르게 검토하고, 현재 구현 범위와 CoreNull/BRAINPOOL 계약의 정합성을 판단할 수 있도록 현재 상태를 기록한다.
>
> **작성 기준:** `master` 브랜치의 현재 구현 기준
>
> **작성일:** 2026-09-07
>
> **작성 주체:** Manus AI

## 1. 결론 요약

하준아이는 현재 **상태 관리, HajunAI 대화, 명시적 마당 탐색, Knowledge 기억 열람**을 제공하는 Next.js 애플리케이션이다. 핵심 화면은 대시보드, 하준아이, 하준챗, 기억으로 구성되어 있다. 헬스 정보는 대시보드에 흡수했으며, 기존 `/health` URL은 북마크 호환을 위해 남겨 두었다.

하준아이의 공간 구조는 데이터 모델에 남아 있다. 관제마당, 개발마당, 브라이언풀마당은 `hajun_yards`의 마당 레코드와 `hajun_rooms`의 방 레코드로 조회된다. 마당은 자동 피드 병합 대상이 아니다. 사용자가 하준아이 화면을 직접 열거나 하준챗을 호출했을 때만 명시적으로 조회된다.

하준챗은 관제 모드와 개발 모드를 제공한다. 두 모드 모두 현재 Groq 모델 `openai/gpt-oss-120b`를 사용한다. 하준챗 호출 시 개발 상태, MindWorld 상태, CoreHub 기회 정보, 관제·개발·브라이언풀마당의 최근 방 메시지를 프롬프트에 포함한다. 이는 마당 간 자동 피드 통합이 아니라 **사용자 요청 시점의 명시적 컨텍스트 조회**다.

현재 `master`에는 위 기능이 빌드 가능한 상태로 반영되어 있다. 최신 관련 커밋은 이 문서의 커밋 이력에서 확인할 수 있으며, 프로덕션 빌드와 TypeScript 검증을 통과했다. 다만 Supabase와 외부 AI 키가 런타임 환경에 설정되어야 실제 데이터 조회와 AI 응답이 동작한다.

## 2. 현재 화면과 역할

| 화면 | 경로 | 역할 | 현재 상태 |
|---|---|---|---|
| 대시보드 | `/dashboard` | Core 선택, 개발 상태 편집, 헬스 요약, Gemini 요약, 이어가기 프롬프트 생성 | 구현 완료 |
| 하준아이 | `/hajun` | 관제마당·개발마당·브라이언풀마당 목록과 각 방의 최근 메시지 탐색 | 구현 완료 |
| 하준아이 거실 | `/hajun/{yard}` | 특정 마당의 방별 최근 메시지 확인 | 구현 완료 |
| 하준아이 방 | `/hajun/{yard}/{room}` | 방 전체 메시지 열람, 메시지 작성, AI 답변 요청 | 구현 완료 |
| 하준챗 | `/chat` | 관제/개발 모드 대화, 세 마당 컨텍스트를 명시적으로 조회 | 구현 완료 |
| 기억 | `/snapshots` | `hajunai_conversations`의 Knowledge Unit 열람 | 구현 완료 |
| 헬스 레거시 URL | `/health` | 기존 헬스 스코어 화면 | 메뉴에서 제거했으나 URL 보존 |

사이드바의 사용자 노출 메뉴는 다음과 같다.

```text
대시보드
하준챗
기억
하준아이
```

메뉴 명칭은 사용자의 지시에 따라 **“하준아이 마당”이 아니라 “하준아이”**로 통일했다.

## 3. 마당 구조와 데이터 흐름

하준아이 마당은 다음 계층으로 표현된다.

```text
하준아이
├── 관제마당 (gwanje)
│   └── 방 목록
├── 개발마당 (gaebal)
│   └── 방 목록
└── 브라이언풀마당 (brainpool)
    └── 방 목록
```

메시지는 방에만 저장된다. 마당과 거실은 메시지를 소유하는 별도 콘텐츠 계층이 아니라 방 메시지를 조건에 따라 보여주는 View다.

| API 액션 | 목적 |
|---|---|
| `GET /api/hajun?action=yard_list` | 마당 목록 조회 |
| `GET /api/hajun?action=room_list&yard={key}` | 특정 마당의 방 목록 조회 |
| `GET /api/hajun?action=view_yard&yard={key}` | 방별 최신 메시지 1개 조회 |
| `GET /api/hajun?action=view_livingroom&yard={key}` | 방별 최근 메시지 묶음 조회 |
| `GET /api/hajun?action=view_room&room_id={id}` | 특정 방의 전체 메시지 조회 |
| `POST /api/hajun?action=post_message` | 방에 명시적으로 메시지 작성 |
| `POST /api/hajun?action=ai_respond` | 특정 방 기록을 읽고 AI 답변 작성 |

`ref_ids`는 메시지가 근거로 삼은 다른 메시지를 가리킨다. 따라서 마당 경계를 자동으로 무시하는 것이 아니라, 사용자가 특정 메시지를 참조로 연결했을 때 그 관계를 보존하는 구조다.

## 4. 하준챗의 현재 동작

하준챗 UI는 관제 모드와 개발 모드로 나뉜다.

| 모드 | 호출 액션 | 현재 동작 |
|---|---|---|
| 관제 | `POST /api/hajun?action=chat` | 개발 상태, MindWorld, CoreHub 기회, 세 마당 최근 메시지를 읽고 HajunAI 응답 생성 |
| 개발 | `POST /api/hajun?action=dev_chat` | 개발 상태와 세 마당 최근 메시지를 읽고 개발 관점의 응답 생성 |

하준챗은 다음 네 종류의 컨텍스트를 조합한다.

1. `dev_contexts`의 현재 개발 상태.
2. `corenull_rooms` 기반 MindWorld 상태.
3. CoreHub의 기회 정보.
4. `hajun_yards` → `hajun_rooms` → `hajun_messages`를 따라 조회한 관제·개발·브라이언풀마당의 최근 방 메시지.

이 조합은 **하준챗을 호출할 때만** 발생한다. 화면 피드가 자동으로 세 마당을 합치거나, 일반적인 AI 호출마다 모든 마당을 무조건 훑는 구조는 아니다. `dev_contexts`의 페이즈·상태는 보조 기록으로 표시하고, 방 메시지에는 `created_at`을 포함해 최신 원본 기록과 구분한다. 오래된 Step 3 또는 CoreRing 요약이 현재 마당 기록과 다르면 과거 기록으로 취급하도록 프롬프트에 명시했다.

하준챗의 브라우저 `localStorage`는 컨텍스트 규칙 변경에 맞춰 `hajunai_chat_messages_v2`로 분리했다. 이전 문구인 “현재는 채팅 기능이 구현되지 않았습니다”가 남아 있으면 새 초기 안내 문구로 교체한다.

## 5. 외부 서비스와 런타임 의존성

실제 동작에는 다음 환경 변수가 필요하다.

| 환경 변수 | 사용처 |
|---|---|
| `SUPABASE_URL` | Supabase REST API 주소 |
| `SUPABASE_SERVICE_KEY` | 마당·방·메시지·개발 상태·Knowledge 조회 및 저장 |
| `GROQ_API_KEY` | 관제 모드, 개발 모드, 방 AI 답변 |
| `GEMINI_API_KEY` | 개발 컨텍스트 요약 |
| `COREHUB_URL` | CoreHub 기회 조회 및 사용 처리; 미설정 시 기본 URL 사용 |

현재 Groq 모델은 다음으로 통일되어 있다.

```text
openai/gpt-oss-120b
```

과거 `llama-3.3-70b-versatile` 참조는 제거했다.

## 6. 문서·컨텍스트 정책

하준아이의 운영 문서와 에이전트 계약 문서는 별도 `brainpool-os` 저장소의 `/api/docs` 경로를 통해 명시적으로 읽는다. 폐기된 `context_package` 자동 주입은 하준코어앱에서 실행하지 않는다.

`GET /api/hajun?action=context_package`는 호환성을 위해 남아 있지만, 더 이상 패키지를 생성하지 않고 `/api/docs?agent=clo2|clo3|pm` 사용 안내를 반환한다.

하준아이의 마당 컨텍스트와 에이전트 문서 컨텍스트는 서로 다른 층위다.

- `/api/docs?agent=...`: 에이전트의 계약, 원칙, 로드맵을 명시적으로 조회한다.
- 하준챗의 마당 조회: 사용자가 HajunAI 대화를 요청한 순간 공간 메시지를 명시적으로 조회한다.
- `ref_ids`: 사용자가 특정 메시지 사이의 근거 관계를 명시적으로 연결한다.

## 7. 완료된 작업

| 항목 | 결과 |
|---|---|
| CoreNull 문서 맵 정합성 | `CoreNull_Core_Principles_v1.2`를 docs API 맵에 추가 |
| `context_package` 폐기 | 실행 구현 제거, 호환 호출은 폐기 안내 반환 |
| 대시보드·헬스 정리 | 헬스 요약을 대시보드에 흡수하고 `/health` URL은 보존 |
| 스냅샷 명칭 정리 | 실제 데이터 성격에 맞춰 메뉴를 `기억`으로 변경 |
| 마당 라우트 복구 | `/hajun`, `/hajun/{yard}`, `/hajun/{yard}/{room}` 복구 |
| 세 마당 연결 | 관제·개발·브라이언풀 마당을 데이터 기반으로 조회 |
| 방 기능 복구 | 메시지 조회·작성·AI 답변 요청 연결 |
| Groq 모델 교체 | 폐기 모델을 `openai/gpt-oss-120b`로 교체 |
| 하준챗 API 연결 | 관제 `chat`, 개발 `dev_chat` 모두 실제 응답 경로 연결 |
| 하준챗 마당 컨텍스트 | 세 마당 최근 메시지를 하준챗 프롬프트에 연결 |
| 작업 브랜치 정리 | 이후 기준을 `master`로 전환 |

## 8. 클로1 총괄 검토가 필요한 항목

첫째, **하준챗이 세 마당 전체를 읽는 범위와 우선순위**를 확정해야 한다. 현재는 각 방의 최근 메시지 3개를 모두 조회한다. 방 수가 많아지면 토큰과 지연 시간이 증가할 수 있으므로, 향후에는 현재 질문과 관련된 방만 선택하거나 마당별 요약 View를 둘지 결정할 필요가 있다.

둘째, **관제 모드와 개발 모드의 책임 경계**를 확정해야 한다. 현재 두 모드는 모두 HajunAI가 응답하지만, 개발 모드는 개발 상태와 마당 기록 중심으로 답한다. 클로1이 관제 모드를 결정·조정 역할로, 개발 모드를 구현·검토 역할로 분리하려면 프롬프트 계약을 문서화해야 한다.

셋째, **마당 데이터의 정식 SoT**를 확인해야 한다. 현재 하준아이 UI는 `hajun_yards`, `hajun_rooms`, `hajun_messages`를 사용한다. CoreNull의 `House → Room → Post` 모델과 하준아이의 레거시 `hajun_*` 모델이 어떤 관계인지 클로1 총괄의 승인이 필요하다.

넷째, **방 AI 답변의 저장 정책은 확정되었지만 구현은 미완료다.** AI 답변은 `adopted` 성격의 검토 대기 기록으로 저장하고, 사람이 확인한 뒤 `confirmed`로 승격한다. 기존 답변은 삭제하지 않고 새 메시지로 이어 쓴다. `ref_ids`는 사용자가 명시적으로 지정한 근거를 우선하며, AI가 읽은 최근 기록 전체를 자동으로 근거 확정하지 않는다. 현재 코드는 `author_type: ai`, `msg_type: answer`까지만 저장하므로 상태 필드·확인 UI·승격 API는 다음 작업이다.

다섯째, **린트 부채**가 남아 있다. 프로덕션 빌드와 TypeScript 컴파일은 성공했지만, 기존 화면의 `react-hooks/set-state-in-effect` 규칙 위반이 대시보드·헬스·스냅샷에 남아 있다. 이는 이번 기능 구현의 컴파일 오류는 아니지만, 클로1 총괄 기준의 품질 게이트에 포함할지 결정해야 한다.

## 9. 권장 다음 단계

클로1 총괄과 먼저 다음 세 가지를 확정하는 것이 안전하다.

1. 하준챗이 전체 세 마당을 읽을 때의 검색 범위와 토큰 제한.
2. `hajun_*` 공간 모델과 CoreNull의 `House → Room → Post` 모델 사이의 공식 관계.
3. 관제 모드, 개발 모드, 방 AI의 역할 및 응답 저장 정책.

이 중 방 AI 응답 저장 정책은 다음과 같이 결정되었다.

```text
AI 생성 답변 → adopted 성격의 검토 대기 기록 → 사람 확인 → confirmed 승격
```

이 결정은 **정책 확정**이며 **구현 완료를 의미하지 않는다**. `hajun_messages` 스키마 변경, 사람 확인 UI, 상태 승격 API는 다음 구현 단계로 남아 있다. `hajun_*`와 CoreNull `House → Room → Post` 모델의 공식 관계는 아직 열려 있으며, 이번 정책과 섞어 임의로 확정하지 않는다.

이 세 가지가 확정되면 하준아이 UI를 더 확장하기보다, 먼저 컨텍스트 선택 규칙과 API 계약을 문서화하는 편이 좋다. 현재 구현은 기능 검증 단계로는 충분하지만, 총괄 계약이 확정되기 전에는 자동 요약·자동 병합·자동 상태 승격을 추가하지 않는 것이 CoreNull 철학에 부합한다.

## References

[1]: https://github.com/sykim-stack/hajuncore-app/blob/master/app/api/hajun/route.ts "HajunAI API route"

[2]: https://github.com/sykim-stack/hajuncore-app/blob/master/app/chat/page.tsx "HajunAI chat UI"

[3]: https://github.com/sykim-stack/hajuncore-app/blob/master/app/hajun/page.tsx "HajunAI yard index"

[4]: https://github.com/sykim-stack/hajuncore-app/blob/master/components/Sidebar.tsx "HajunCore navigation"

[5]: https://github.com/sykim-stack/brainpool-os/blob/main/doc/directives/CoreNull_Core_Principles_v1.2.md "CoreNull Core Principles v1.2"

[6]: https://github.com/sykim-stack/brainpool-os/blob/main/doc/contexts/clo3.md "clo3 context contract"
