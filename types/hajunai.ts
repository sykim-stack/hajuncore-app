// types/hajunai.ts
// BRAINPOOL Schema Contract v1.1
// Single Source of Truth
//
// v1.1 변경: KnowledgeUnit에 ADR-K04 메타데이터 추가
//   (derived_at, derived_version, derived_by, source_message_ids)
//
// 새 필드 추가 시 체크리스트:
//   1. 이 파일에 타입 추가
//   2. Supabase 테이블에 컬럼 추가
//   3. 해당 API route에 반영
//   4. Dashboard/UI에 표시 추가

// ── Gemini summarize_context 반환 타입 ───────────────────────
export type DevContextSummary = {
  // 기존 4개
  last_task:            string;
  summary:              string;
  next_action:          string;
  current_problems:     string;
  // v1.1 신규 4개
  development_summary:  string;
  conversation_summary: string;
  decisions:            string;
  risks:                string;
};

export type SummarizeContextResponse = {
  summary:  DevContextSummary;
  traceId:  string;
  _error?:  string;
};

// ── dev_contexts 전체 행 타입 ─────────────────────────────────
export type DevContext = {
  id:                    string;
  project_id:            string;
  phase?:                string;
  status?:               string;
  health_score?:         number;
  last_task?:            string;
  next_action?:          string;
  current_problems?:     string;
  action_reasoning?:     string;
  last_idea_summary?:    string;
  summary?:              string;
  development_summary?:  string;
  conversation_summary?: string;
  decisions?:            string;
  risks?:                string;
  architecture?:         string;
  dependencies?:         string;
  stack?:                string;
  code_context?:         string;
  key_files?:            string[];
  next_tasks?:           string[];
  completed_tasks?:      string[];
  knowledge?:            string[];
  user_id?:              string;
  updated_at?:           string;
  created_at?:           string;
};

// ── PATCH 허용 키 목록 ────────────────────────────────────────
export const DEV_CONTEXT_SUMMARY_FIELDS: (keyof DevContextSummary)[] = [
  'last_task', 'summary', 'next_action', 'current_problems',
  'development_summary', 'conversation_summary', 'decisions', 'risks',
];

// ── Knowledge Unit 타입 (hajunai_conversations) ───────────────
// ADR-K04 메타데이터 포함 (v1.1)
export type KnowledgeUnit = {
  id:               string;
  project_id?:      string;

  // 분류
  source_ai?:       string;
  source_core?:     'CoreRing' | 'CoreChat' | 'CoreNull' | 'HajunAI' | 'external' | null;
  knowledge_type?:  'language' | 'context' | 'life' | 'pattern' | 'raw' | null;
  person_id?:       string | null;

  // 내용
  original_message: string;
  summary?:         string | null;
  keywords?:        string[] | null;
  connections?:     string[] | null;
  confidence?:      number | null;   // 0.00 ~ 1.00

  // 시간
  observed_at?:     string | null;   // 실제 관찰 시점
  created_at?:      string;          // DB 저장 시점

  // ADR-K04 Derived Data 메타데이터
  derived_at?:          string | null;   // Derived Data 생성 시점
  derived_version?:     string | null;   // 알고리즘 버전 (예: "1.0")
  derived_by?:          string | null;   // 생성 주체 (예: "CoreNull", "HajunAI")
  source_message_ids?:  string[] | null; // 원본 Message ID 참조

  meta?:            Record<string, unknown> | null;
};

// ── Knowledge Unit 생성 시 ADR-K04 필수 메타데이터 ────────────
// house_snapshots → Knowledge Unit 변환 시 반드시 포함
export type DerivedDataMeta = {
  derived_at:         string;   // new Date().toISOString()
  derived_version:    string;   // 현재 변환 알고리즘 버전
  derived_by:         string;   // 'CoreNull' | 'HajunAI' | ...
  source_message_ids: string[]; // 원본 Message ID 목록 (재생성 가능성 확보)
};