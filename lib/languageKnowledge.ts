// lib/languageKnowledge.ts
// Phase 2: CoreRing → HajunAI Language Knowledge 소비 인터페이스
// 원칙: 읽기 전용 (SELECT only). language_knowledge 테이블 생성/수정/삭제 절대 금지.
// Owner: CoreRing (클로5). HajunAI(클로2)는 여기서 쓰기 작업을 하지 않는다.
// 참고: TASK - Language Knowledge Pipeline v1.0, Section 2/5

import { supabaseGet } from '@/lib/supabase';

export type LanguageKnowledge = {
  id: string;
  source_core: string;
  knowledge_type:
    | 'emotion_pattern'
    | 'cultural_pattern'
    | 'translation_pattern'
    | 'dialect_pattern'
    | string;
  pattern_key: string;
  source_expression?: string | null;
  description: string;
  emotion?: string | null;
  intent?: string | null;
  confidence: number;
  frequency: number;
  status?: 'candidate' | 'verified' | 'deprecated' | string;
  metadata?: Record<string, unknown> | null;
  created_at?: string;
  updated_at?: string;
};

export type FetchLanguageKnowledgeQuery = {
  pattern_key?: string;
  knowledge_type?: string;
  text?: string;             // description / source_expression 부분 일치 검색
  limit?: number;
  minConfidence?: number;
  includeCandidate?: boolean; // true면 candidate 포함, 기본은 verified만
};

/**
 * CoreRing이 생성한 language_knowledge를 읽기 전용으로 조회한다.
 * HajunAI는 반드시 이 함수를 통해서만 Language Knowledge에 접근해야 한다.
 * 실패 시 throw 하지 않고 빈 배열을 반환한다 (supabaseGet 기존 fail-soft 패턴 준수).
 */
export async function fetchLanguageKnowledge(
  query: FetchLanguageKnowledgeQuery = {}
): Promise<LanguageKnowledge[]> {
  const {
    pattern_key,
    knowledge_type,
    text,
    limit = 5,
    minConfidence = 0.6,
    includeCandidate = false,
  } = query;

  const params: string[] = [];
  params.push('order=confidence.desc,frequency.desc');
  params.push(`limit=${limit}`);
  params.push(`confidence=gte.${minConfidence}`);

  if (!includeCandidate) {
    params.push('status=eq.verified');
  }
  if (pattern_key) {
    params.push(`pattern_key=eq.${encodeURIComponent(pattern_key)}`);
  }
  if (knowledge_type) {
    params.push(`knowledge_type=eq.${encodeURIComponent(knowledge_type)}`);
  }
  if (text) {
    const like = encodeURIComponent(`%${text}%`);
    params.push(`or=(description.ilike.${like},source_expression.ilike.${like})`);
  }

  const path = `language_knowledge?${params.join('&')}`;
  const data = await supabaseGet(path);
  return Array.isArray(data) ? data : [];
}

/**
 * chat 시스템 프롬프트에 주입할 참고용 텍스트 블록.
 * 강제하지 않고 자연스러운 참고 정보로만 제공한다 (TASK 문서 Section 5 원칙).
 */
export function buildLanguageKnowledgeBlock(items: LanguageKnowledge[]): string {
  if (!items || items.length === 0) return '';
  return items
    .map((k) => {
      const expr = k.source_expression ? `"${k.source_expression}" — ` : '';
      return `- [${k.knowledge_type}] ${expr}${k.description}`;
    })
    .join('\n');
}