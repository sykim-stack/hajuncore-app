// lib/contextPackage.ts
// context_package action — agent별 세션 시작 맥락 패키지
// agent=clo2|claude2 (기본) | clo3

import { supabaseGet } from '@/lib/supabase';

const CORENULL_PROJECT_ID = 'aaaaaaaa-0000-0000-0000-000000000003';

export async function buildContextPackage(agentParam: string | null) {
  const agent = agentParam || 'clo2';
  const normalizedAgent = agent === 'claude2' ? 'clo2' : agent;
  const docsAgent = normalizedAgent === 'clo2' ? 'clo2' : normalizedAgent;
  const DOCS_URL = `https://hajuncore-app.vercel.app/api/docs?agent=${docsAgent}`;

  const devCtxQuery =
    normalizedAgent === 'clo3'
      ? `dev_contexts?project_id=eq.${CORENULL_PROJECT_ID}&order=updated_at.desc&limit=1`
      : 'dev_contexts?order=updated_at.desc&limit=1';

  const [docsRes, devCtxData, knowledgeData] = await Promise.all([
    fetch(DOCS_URL, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
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

  const devCtx = (devCtxData as unknown[])?.[0] || null;
  const docs = (docsRes as { docs?: Record<string, string> })?.docs || {};

  const constitutionText = docs['Master_Prompt_v2.0'] || '';
  const agentsText = docs['Agents_Directive'] || '';
  const contractText =
    normalizedAgent === 'clo3'
      ? docs['clo3'] || docs['CORENULL_ROADMAP'] || ''
      : docs['clo2'] || '';
  const roadmapText = docs['CORENULL_ROADMAP'] || '';

  const d = devCtx as Record<string, string> | null;
  const devCtxText = d
    ? [
        d.phase ? `페이즈: ${d.phase}` : '',
        d.last_task ? `마지막 작업: ${d.last_task}` : '',
        d.next_action ? `다음 액션: ${d.next_action}` : '',
        d.current_problems && d.current_problems !== '없음'
          ? `현재 문제: ${d.current_problems}`
          : '',
        d.development_summary ? `개발 현황: ${d.development_summary}` : '',
        d.conversation_summary ? `최근 논의: ${d.conversation_summary}` : '',
        d.decisions && d.decisions !== '없음' ? `확정 결정: ${d.decisions}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '개발 맥락 없음 (CoreNull 전용 row 미생성 시 공통 row fallback)';

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
      ? '당신은 BRAINPOOL OS의 클로3 (CoreNull Space Layer) 에이전트입니다.\nCoreNull은 껍데기다. 글-이미지-댓글만 존재한다. House→Room→Post. Seed/Flower/Fruit는 Room 상태값이다.'
      : '당신은 BRAINPOOL OS의 클로2 (HajunAI Mind Layer) 에이전트입니다.';

  const injectionParts = [
    roleLine,
    '',
    '=== CONSTITUTION (불변의 원칙) ===',
    constitutionText.slice(0, 1500),
    '',
    '=== 에이전트 역할 ===',
    agentsText.slice(0, 500),
    '',
    '=== Context Contract ===',
    contractText.slice(0, 2000),
  ];

  if (normalizedAgent === 'clo3' && roadmapText) {
    injectionParts.push('', '=== CoreNull Phase A 로드맵 ===', roadmapText.slice(0, 2500));
  }

  injectionParts.push(
    '',
    '=== 현재 개발 현황 ===',
    devCtxText,
    '',
    '=== 축적된 Knowledge ===',
    knowledgeText,
    '',
    '위 맥락을 완전히 이해하고 BRAINPOOL 철학에 따라 작업을 이어가세요.'
  );

  return {
    agent: normalizedAgent,
    injection_prompt: injectionParts.join('\n'),
    raw: {
      constitution: constitutionText.slice(0, 500) + '...',
      contract: contractText.slice(0, 300) + (contractText.length > 300 ? '...' : ''),
      dev_ctx: devCtx,
      knowledge_count: Array.isArray(knowledgeData) ? knowledgeData.length : 0,
    },
    fetched_at: new Date().toISOString(),
  };
}
