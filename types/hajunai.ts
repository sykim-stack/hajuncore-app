// types/hajunai.ts
// BRAINPOOL Schema Contract v1.0
// 이 파일이 진실의 단일 출처(Single Source of Truth)입니다.
// Gemini 응답 → summarize_context → Dashboard → API → Supabase
// 전부 이 타입을 기준으로 합니다.
//
// 새 필드 추가 시 체크리스트:
//   1. DevContextSummary에 필드 추가
//   2. DEV_CONTEXT_SUMMARY_FIELDS 배열에 추가
//   3. Supabase dev_contexts 테이블에 컬럼 추가
//   4. summarize_context Gemini 프롬프트에 필드 추가
//   5. Dashboard에 표시 섹션 추가

// ── Gemini summarize_context 반환 타입 ───────────────────────
export type DevContextSummary = {
  // 기존 4개 (dev_contexts 기존 컬럼)
  last_task:            string;   // 최근 핵심 작업 (100자 이내)
  summary:              string;   // 프로젝트 전체 현재 상태 (200자 이내)
  next_action:          string;   // 지금 당장 할 것
  current_problems:     string;   // 현재 블로커 (없으면 "없음")

  // 신규 4개 (v1.1 — dev_contexts 컬럼 추가됨)
  development_summary:  string;   // 개발 진행 상황 (완료+진행, 200자 이내)
  conversation_summary: string;   // 최근 논의 핵심 (150자 이내)
  decisions:            string;   // 확정된 설계 결정 (없으면 "없음")
  risks:                string;   // 주의사항 (없으면 "없음")
};

// summarize_context API 응답 타입
export type SummarizeContextResponse = {
  summary:  DevContextSummary;
  traceId:  string;
  _error?:  string;
};

// ── dev_contexts 전체 행 타입 ─────────────────────────────────
export type DevContext = {
  id:                   string;
  project_id:           string;

  // 개발 상태
  phase?:               string;
  status?:              string;
  health_score?:        number;

  // 작업 관리
  last_task?:           string;
  next_action?:         string;
  current_problems?:    string;
  action_reasoning?:    string;
  last_idea_summary?:   string;

  // 요약 (Gemini 생성)
  summary?:             string;
  development_summary?: string;
  conversation_summary?:string;
  decisions?:           string;
  risks?:               string;

  // 아키텍처
  architecture?:        string;
  dependencies?:        string;
  stack?:               string;
  code_context?:        string;
  key_files?:           string[];
  next_tasks?:          string[];
  completed_tasks?:     string[];
  knowledge?:           string[];

  user_id?:             string;
  updated_at?:          string;
  created_at?:          string;
};

// ── Supabase dev_contexts 필드 목록 ──────────────────────────
// summarize_context 반환값을 PATCH할 때 이 배열의 키만 허용
export const DEV_CONTEXT_SUMMARY_FIELDS: (keyof DevContextSummary)[] = [
  'last_task',
  'summary',
  'next_action',
  'current_problems',
  'development_summary',
  'conversation_summary',
  'decisions',
  'risks',
];

// ── Knowledge Unit 타입 (hajunai_conversations) ───────────────
export type KnowledgeUnit = {
  id:               string;
  source_ai?:       string;
  source_core?:     'CoreRing' | 'CoreChat' | 'CoreNull' | 'HajunAI' | 'external' | null;
  knowledge_type?:  'language' | 'context' | 'life' | 'pattern' | 'raw' | null;
  person_id?:       string | null;
  original_message: string;
  summary?:         string | null;
  keywords?:        string[] | null;
  connections?:     string[] | null;
  confidence?:      number | null;
  observed_at?:     string | null;
  created_at?:      string;
  meta?:            Record<string, unknown> | null;
};