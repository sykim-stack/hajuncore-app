// lib/contextPackage.ts
// context_package — agent별 세션 시작 맥락 패키지
// GET /api/hajun?action=context_package&agent=clo2|clo3

import { supabaseGet } from '@/lib/supabase';

const CORENULL_PROJECT_ID = 'aaaaaaaa-0000-0000-0000-000000000003';
const DOCS_BASE = 'https://hajuncore-app.vercel.app/api/docs';

/** agent별 필수 문서 키 */
const AGENT_DOC_KEYS: Record<string, string[]> = {
  clo2: ['Master_Prompt_v2.0', 'Agents_Directive', 'clo2'],
  clo3: ['Master_Prompt_v2.0', 'Agents_Directive', 'clo3', 'CORENULL_ROADMAP', 'CoreNull_Seed_System'],
};

/** 단일 문서 fetch — { content } 또는 실패 시 빈 문자열 */
async function fetchDoc(fileKey: string): Promise<string> {
  try {
    const res = await fetch(`${DOCS_BASE}?file=${encodeURIComponent(fileKey)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return '';
    const json = await res.json();
    if (typeof json?.content === 'string') return json.content;
    if (typeof json?.docs?.[fileKey] === 'string') return json.docs[fileKey];
    return '';
  } catch {
    return '';
  }
}

/** agent 패키지 또는 개별 fetch로 문서 맵 구성 */
async function loadDocs(agent: string): Promise<Record<string, string>> {
  const keys = AGENT_DOC_KEYS[agent] || AGENT_DOC_KEYS.clo2;
  const result: Record<string, string> = {};

  // 1) agent 일괄 시도
  try {
    const res = await fetch(`${DOCS_BASE}?agent=${encodeURIComponent(agent)}`, {
      cache: 'no-store',
    });
    if (res.ok) {
      const json = await res.json();
      if (json?.docs && typeof json.docs === 'object') {
        for (const key of keys) {
          if (typeof json.docs[key] === 'string' && json.docs[key].length > 50) {
            result[key] = json.docs[key];
          }
        }
      }
    }
  } catch {
    /* fallback below */
  }

  // 2) 빠진 키는 개별 fetch
  const missing = keys.filter((k) => !result[k]);
  if (missing.length > 0) {
    const fetched = await Promise.all(missing.map(async (k) => [k, await fetchDoc(k)] as const));
    for (const [k, v] of fetched) {
      if (v) result[k] = v;
    }
  }

  return result;
}

function formatDevCtx(d: Record<string, unknown> | null): string {
  if (!d) return '개발 맥락 없음';

  const lines: string[] = [];
  if (d.phase) lines.push(`페이즈: ${d.phase}`);
  if (d.status) lines.push(`상태: ${d.status}`);
  if (d.last_task) lines.push(`마지막 작업: ${d.last_task}`);
  if (d.next_action) lines.push(`다음 액션: ${d.next_action}`);
  if (d.current_problems && d.current_problems !== '없음') {
    lines.push(`현재 문제: ${d.current_problems}`);
  }
  if (d.summary) lines.push(`요약: ${d.summary}`);
  if (d.architecture) lines.push(`아키텍처: ${d.architecture}`);
  if (d.development_summary) lines.push(`개발 현황: ${d.development_summary}`);
  if (d.conversation_summary) lines.push(`최근 논의: ${d.conversation_summary}`);
  if (d.decisions && d.decisions !== '없음') lines.push(`확정 결정: ${d.decisions}`);

  if (Array.isArray(d.completed_tasks) && d.completed_tasks.length > 0) {
    lines.push(`완료: ${(d.completed_tasks as string[]).slice(0, 8).join(' / ')}`);
  }
  if (Array.isArray(d.next_tasks) && d.next_tasks.length > 0) {
    lines.push(`다음 작업:\n${(d.next_tasks as string[]).map((t) => `  - ${t}`).join('\n')}`);
  }

  return lines.filter(Boolean).join('\n') || '개발 맥락 파싱 실패';
}

export async function buildContextPackage(agentParam: string | null) {
  const agent = agentParam || 'clo2';
  const normalizedAgent = agent === 'claude2' ? 'clo2' : agent;

  const devCtxQuery =
    normalizedAgent === 'clo3'
      ? `dev_contexts?project_id=eq.${CORENULL_PROJECT_ID}&order=updated_at.desc&limit=1`
      : 'dev_contexts?order=updated_at.desc&limit=1';

  const [docs, devCtxData, knowledgeData] = await Promise.all([
    loadDocs(normalizedAgent),
    supabaseGet(devCtxQuery).then(async (rows: unknown[]) => {
      if (normalizedAgent === 'clo3' && (!rows || rows.length === 0)) {
        return supabaseGet('dev_contexts?order=updated_at.desc&limit=1');
      }
      return rows;
    }),
    supabaseGet(
      'hajunai_conversations?order=created_at.desc&limit=10' +
        '&select=summary,keywords,knowledge_type,source_core,confidence,created_at' +
        '&knowledge_type=neq.raw'
    ),
  ]);

  const devCtx = ((devCtxData as unknown[])?.[0] as Record<string, unknown>) || null;

  const constitutionText = docs['Master_Prompt_v2.0'] || '';
  const agentsText = docs['Agents_Directive'] || '';
  const contractText =
    normalizedAgent === 'clo3' ? docs['clo3'] || '' : docs['clo2'] || '';
  const roadmapText = docs['CORENULL_ROADMAP'] || '';
  const seedText = docs['CoreNull_Seed_System'] || '';

  const knowledgeText =
    Array.isArray(knowledgeData) && knowledgeData.length > 0
      ? knowledgeData
          .map(
            (k: {
              knowledge_type?: string;
              summary?: string;
              keywords?: string[];
            }) =>
              `[${k.knowledge_type}] ${k.summary || ''} ${
                k.keywords?.length ? `(${k.keywords.slice(0, 3).join(', ')})` : ''
              }`
          )
          .join('\n')
      : '축적된 Knowledge 없음';

  const roleLine =
    normalizedAgent === 'clo3'
      ? [
          '당신은 BRAINPOOL OS의 클로3 (CoreNull Space Layer) 에이전트입니다.',
          'CoreNull은 껍데기다. 글·이미지·댓글만 존재한다.',
          'Primitive: House → Room → Post',
          'Seed / Flower / Fruit = Room 상태값 (별도 테이블·객체 아님).',
          '새 Primitive는 최후의 수단. View Scope로 Experience를 표현한다.',
          '판단·추천·의미분석은 하지 않는다 (CoreHub / HajunAI / CoreRing 영역).',
        ].join('\n')
      : [
          '당신은 BRAINPOOL OS의 클로2 (HajunAI Mind Layer) 에이전트입니다.',
          'Messages 직접 접근을 최소화한다. Knowledge Unit·Context로 사람을 이해한다.',
          'seed_mode는 별도 Seed 엔티티가 아니라 Room 상태값으로 해석한다.',
        ].join('\n');

  const parts: string[] = [
    roleLine,
    '',
    '=== CONSTITUTION (불변의 원칙) ===',
    constitutionText.slice(0, 1800) || '(Constitution 로드 실패 — /api/docs?file=Master_Prompt_v2.0 확인)',
    '',
    '=== 에이전트 역할 ===',
    agentsText.slice(0, 600) || '(Agents_Directive 로드 실패)',
    '',
    '=== Context Contract ===',
    contractText.slice(0, 2500) ||
      (normalizedAgent === 'clo3'
        ? '(clo3.md 로드 실패 — /api/docs?file=clo3 확인)'
        : '(clo2.md 로드 실패)'),
  ];

  if (normalizedAgent === 'clo3') {
    if (roadmapText) {
      parts.push('', '=== CoreNull Phase A 로드맵 ===', roadmapText.slice(0, 2800));
    }
    if (seedText) {
      parts.push('', '=== Seed System ===', seedText.slice(0, 1200));
    }
  }

  parts.push(
    '',
    '=== 현재 개발 현황 (dev_contexts) ===',
    formatDevCtx(devCtx),
    '',
    '=== 축적된 Knowledge ===',
    knowledgeText,
    '',
    '위 맥락을 완전히 이해하고 BRAINPOOL 철학에 따라 작업을 이어가세요.',
    normalizedAgent === 'clo3'
      ? 'Phase A 순서: Room Card → 거실 → 광장 → 마당(집주인만) → 서재. 재작업 금지 항목은 건드리지 마세요.'
      : ''
  );

  return {
    agent: normalizedAgent,
    injection_prompt: parts.filter((p, i, arr) => !(p === '' && arr[i - 1] === '')).join('\n'),
    raw: {
      docs_loaded: Object.keys(docs),
      constitution_len: constitutionText.length,
      contract_len: contractText.length,
      roadmap_len: roadmapText.length,
      dev_ctx: devCtx,
      knowledge_count: Array.isArray(knowledgeData) ? knowledgeData.length : 0,
    },
    fetched_at: new Date().toISOString(),
  };
}
