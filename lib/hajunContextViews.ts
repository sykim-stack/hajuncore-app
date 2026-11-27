// lib/hajunContextViews.ts
// BRAINPOOL three-yard semantic views.
// The three yards are analytical viewpoints over the same immutable source messages.
// They are NOT the five engine rooms defined in lib/hajunRooms.ts.
// This module only defines the view contract and prompt; it does not write to storage.

export const CONTEXT_VIEW_KEYS = ['gwanje', 'gaebal', 'brainpool'] as const;

export type ContextViewKey = (typeof CONTEXT_VIEW_KEYS)[number];

export const CONTEXT_VIEW_DEFINITIONS: Record<
  ContextViewKey,
  { label: string; purpose: string; include: string[]; exclude: string[] }
> = {
  gwanje: {
    label: '관제마당',
    purpose:
      '실제 사용자와 BRAINPOOL 서비스 운영의 연결을 관찰·분석한다. 사용자 경험, 실제 사용 흐름, 관계·참여, 운영 상태, 이상 증상과 그 근거를 다룬다.',
    include: [
      '실제 사용자와 서비스 사이의 관계 및 연결',
      '실제 사용 경험과 사용 흐름',
      '운영 상태, 반복되는 오류·마찰·이상 증상',
      '문제 발생 시 개발마당의 관련 개발 맥락을 찾아볼 필요',
    ],
    exclude: [
      '실제 관찰 근거가 없는 사용자 행동 추측',
      '개발 이력 자체를 사용자 관찰 사실로 취급하는 것',
      '사람 승인 없는 운영 변경이나 재설계 적용',
    ],
  },
  gaebal: {
    label: '개발마당',
    purpose:
      '다섯 프로젝트(CoreNull, CoreChat, CoreRing, CoreHub, HajunAI)의 개발 내용과 상호 의존·변경 이력을 분류·분석한다.',
    include: [
      'CoreNull 개발 내용과 설계·구현 이력',
      'CoreChat 개발 내용과 설계·구현 이력',
      'CoreRing 개발 내용과 설계·구현 이력',
      'CoreHub 개발 내용과 설계·구현 이력',
      'HajunAI 개발 내용과 설계·구현 이력',
      '프로젝트 사이의 연결, 의존성, 영향 범위, 미해결 작업',
    ],
    exclude: [
      '근거 없는 프로젝트 귀속',
      '제안·실험을 확정된 구현이나 결정으로 승격하는 것',
      '사람 승인 없는 코드·DB·배포 변경',
    ],
  },
  brainpool: {
    label: '브라이언풀마당',
    purpose:
      'BRAINPOOL OS의 핵심 철학, 불변 원칙, 설계 기준과 그 적용 사례를 분류·연결한다.',
    include: [
      'Human First 및 사람의 최종 판단',
      '원본(Source) 보존과 View·해석의 분리',
      'SSOT, Core Independence, Meaning First',
      '구조는 고정하고 의미는 진화시키는 원칙',
      '문서·설계·운영에서 철학이 적용된 사례와 긴장 관계',
    ],
    exclude: [
      '일회성 구현 세부사항을 핵심 철학으로 일반화하는 것',
      'AI 제안을 사람의 결정으로 취급하는 것',
      '원본을 해석 결과로 덮어쓰는 것',
    ],
  },
};

export type ContextViewAssignment = {
  view: ContextViewKey;
  reason: string;
  evidence: string[];
  confidence: 'high' | 'medium' | 'low';
};

export type ContextViewAnalysis = {
  source_message_id: string;
  assignments: ContextViewAssignment[];
  unclassified_reason?: string;
  related_project_refs: string[];
  open_questions: string[];
};

/**
 * Build the read-only instruction used to derive multiple semantic views from one source.
 * The source text is supplied as data by the caller; no write or mutation is performed here.
 */
export function buildContextViewAnalysisPrompt(input: {
  sourceMessageId: string;
  sourceContent: string;
  sourceType?: string;
  sourceCreatedAt?: string;
}): string {
  const definitions = CONTEXT_VIEW_KEYS.map((key) => {
    const view = CONTEXT_VIEW_DEFINITIONS[key];
    return [
      `[${key}] ${view.label}`,
      `목적: ${view.purpose}`,
      `포함 기준: ${view.include.join(' / ')}`,
      `제외 기준: ${view.exclude.join(' / ')}`,
    ].join('\n');
  }).join('\n\n');

  return [
    '당신은 HajunAI의 맥락 View 분석기다.',
    '입력 원본 메시지 하나를 읽고 관련 있는 마당 View를 0개 이상 복수로 제안한다.',
    '세 마당은 같은 원본을 바라보는 분석 관점이다. 원본을 이동·복제·수정하는 저장 작업이 아니다.',
    '관제마당은 실제 사용자 및 서비스 운영 관점, 개발마당은 다섯 프로젝트의 개발 이력 관점, 브라이언풀마당은 핵심 철학 관점이다.',
    '다섯 엔진방(CoreNull/CoreChat/CoreRing/CoreHub/Hajun)과 세 마당(gwanje/gaebal/brainpool)을 혼동하지 않는다.',
    '근거가 부족하면 억지로 분류하지 않는다. 하나의 원본을 여러 마당에 연결할 수 있다.',
    '각 연결에는 원문에서 확인 가능한 짧은 근거를 붙인다. 추측은 사실처럼 쓰지 않는다.',
    '프로젝트·철학·사용자 상태를 새로 확정하지 않는다. 제안만 한다.',
    '원본 메시지, DB, 방, 마당, 연결 관계를 직접 쓰거나 변경하지 않는다.',
    '응답은 설명문 없이 유효한 JSON 객체 하나로 반환한다.',
    'assignments[].view 값은 gwanje, gaebal, brainpool 중 정확히 하나만 사용한다.',
    'assignments[].confidence 값은 high, medium, low 중 정확히 하나만 사용한다.',
    'related_project_refs 항목은 CoreNull, CoreChat, CoreRing, CoreHub, HajunAI 중 정확한 프로젝트 이름만 사용한다.',
    'JSON 스키마:',
    JSON.stringify({
      source_message_id: input.sourceMessageId,
      assignments: [
        { view: 'gwanje', reason: '분류 이유', evidence: ['원문 근거'], confidence: 'medium' },
      ],
      unclassified_reason: '분류하지 않았다면 이유, 아니면 빈 문자열',
      related_project_refs: ['CoreRing'],
      open_questions: ['사람 확인이 필요한 질문'],
    }, null, 2),
    '=== 세 마당 기준 ===',
    definitions,
    '=== 분석 대상 원본 (읽기 전용) ===',
    `message_id: ${input.sourceMessageId}`,
    `message_type: ${input.sourceType || 'unknown'}`,
    `created_at: ${input.sourceCreatedAt || 'unknown'}`,
    'content:',
    input.sourceContent,
  ].join('\n\n');
}
