// lib/groundTruth.ts
// AI 헐루시네이션 방지용 Ground Truth Block.
// DB에서 조회하는 게 아니라 코드에 고정된 사실만 담는다 — 조회 실패로 없어지지 않게.
//
// 배경 (2026-08-23): dev_chat에서 Nemotron/Codestral이 devPrompt(질문 + 얕은 요약)만 받고
// "지어내지 마라"는 규칙도, 실제 스키마 같은 사실 정보도 없어서, 매번 그럴듯하지만
// 존재하지 않는 SQL/엔드포인트/파일 경로를 만들어냈다 (예: dev_contexts에 없는
// agent_id/context_package 컬럼, 존재하지 않는 /context_package?agent_id= 엔드포인트,
// 가짜 ADR 이름 등). 관제 하준아이(Groq)는 실제 DB 데이터 + "모르면 모른다" 규칙이
// 있어서 정직하게 답했다 — 이 차이를 메우기 위한 공통 원천 자료.
//
// 스키마가 바뀌면 이 파일만 고치면 된다. 새 컬럼/테이블/action을 추가했는데
// 여기 반영을 안 하면, AI들이 또 그 부분만 지어내기 시작한다는 걸 기억할 것.

export const GROUND_TRUTH_BLOCK = `=== 실제 시스템 사실 (이 안에 없는 것은 지어내지 말고 "모른다"고 답할 것) ===

[5개 고정 엔진방] (hajun_rooms.name)
CoreNull, CoreChat, CoreRing, CoreHub, Hajun — 이 5개뿐. 다른 방 이름 없음.

[dev_contexts 실제 컬럼]
id, project_id, phase, status, health_score, last_task, next_action,
current_problems, action_reasoning, last_idea_summary, summary,
development_summary, conversation_summary, decisions, risks, architecture,
dependencies, stack, code_context, key_files(배열), next_tasks(배열),
completed_tasks(배열), knowledge(배열), user_id, updated_at, created_at.
※ agent_id, context_package 같은 컬럼은 없다.

[hajun_posts 실제 컬럼]
id, room_id, project_ref, author_agent, model_used, content, adopted,
question_ref, confirmed_by_human, confirmed_at, confirmed_by, created_at.
※ adopted=AI 라운드에서 선택된 답(자동, 검증 아님). confirmed_by_human=사람이
확정한 프로젝트 결정(기본 false, 아직 이걸 true로 바꾸는 API 없음). 이 둘은 다르다.

[work_logs 실제 컬럼]
id, title, summary, files_changed(배열), issues, next_steps, source,
raw_trigger_message, created_at.

[language_knowledge 실제 컬럼] (CoreRing 소유, 읽기 전용)
id, source_core, knowledge_type, pattern_key, source_expression, description,
emotion, intent, confidence, frequency, status, metadata, created_at, updated_at.

[hajunai_conversations 실제 컬럼]
id, source_ai, source_core, knowledge_type, person_id, original_message,
summary, keywords(배열), connections(배열), confidence, observed_at,
created_at, derived_at, derived_version, derived_by, source_message_ids(배열), meta.

[/api/hajun 실제 action 목록]
GET: contexts, dev_contexts, snapshots, sync_snapshot, context_package, room_context
POST: update_dev_context, chat, dev_chat, summarize_context
※ 이 목록 밖의 action(예: agent_id 기반 조회 같은 것)은 존재하지 않는다.

[존재하지 않는 것 — 절대 지어내지 말 것]
localhost:5000 같은 로컬 서버, agent_id 파라미터, context_package 컬럼,
Coreling DB라는 별도 DB(실제로는 Supabase 하나뿐), make 명령어(makefile 없음),
axum/Rust 관련 코드(이 프로젝트는 전부 TypeScript/Next.js), ADR-K05라는 이름
(실제로는 ADR-CONFIRM-000).

이 블록에 없는 파일 경로, 함수명, 테이블명, API 엔드포인트, 정책 문서명은
추측하지 말고 "이 정보는 현재 맥락에 없습니다"라고 답할 것.`;