/**
 * Hermes Phase 0 — Action Unit 규칙 함수
 *
 * ADR-HERMES-000 경계:
 * - Action Unit = 변화 ∧ 필요 ∧ 방향 (3조건 모두)
 * - 행동 후보 5개만: 이해갱신 / 남김 / 확인질문 / 연결 / 보류
 * - 판단·제안만. 실행 금지.
 * - 보류는 정상 결과.
 *
 * 기준 사례 5문장 (수용 기준):
 * - 안녕 → 없음 / 보류
 * - 이건 중요해 → 있음 / 이해갱신 + 확인질문
 * - 전에 말한 것과 달라 → 있음 / 이해갱신 + 연결 + 확인질문
 * - 이건 기록해줘 → 있음 / 남김
 * - 잘 모르겠어 → 있음 / 확인질문 + 보류
 *
 * 일반 서술(예: 날씨)은 변화 신호 없으면 Action Unit 없음.
 */

/** Phase 0 고정 — 5후보만. 추가 금지. */
export type ActionCandidate =
  | '이해갱신'
  | '남김'
  | '확인질문'
  | '연결'
  | '보류';

export interface HermesInput {
  utterance: string;
  understanding: string | null;
  related_refs?: string[];
  room_type?: 'context' | 'product' | string;
}

export interface HermesJudgment {
  hasActionUnit: boolean;
  candidates: ActionCandidate[];
  primary?: ActionCandidate;
  /** 내부 로그용. 사용자 노출 금지. */
  reason_brief?: string;
}

/**
 * Hermes Phase 0 규칙 함수 (순수 · 결정적)
 * 3조건(변화·필요·방향) 모두 true일 때만 Action Unit 발생.
 * 하나라도 false → hasActionUnit=false, candidates=['보류']
 */
export function evaluateHermesRule(input: HermesInput): HermesJudgment {
  const text = (input.utterance || '').trim();
  const understanding = (input.understanding || '').trim();

  // ① 의미 없음 (잡담·인사)
  if (!text || isChitchat(text)) {
    return noUnit('의미 없음 / 잡담');
  }

  // 상품 마당 등은 Phase 0에서 제외
  if (input.room_type === 'product') {
    return noUnit('상품 마당 제외');
  }

  // ② 변화 (Change) — 명시 신호만. 길이만으로 변화 인정 금지.
  const hasChange = detectChange(text, understanding);
  if (!hasChange) return noUnit('변화 없음');

  // ③ 필요 (Need)
  const hasNeed = detectNeed(text);
  if (!hasNeed) return noUnit('필요 없음');

  // ④ 방향 (Direction)
  const candidates = mapCandidates(text, understanding, input.related_refs);
  // 보류만 있으면 방향 있는 Action Unit으로 보지 않음
  const actionable = candidates.filter((c) => c !== '보류');
  if (actionable.length === 0) {
    return noUnit('방향 없음 (보류만)');
  }

  // ⑤ Action Unit 발생
  const primary = pickPrimary(candidates);
  return {
    hasActionUnit: true,
    candidates,
    primary,
    reason_brief: `변화+필요+방향 → ${candidates.join(',')}`,
  };
}

function noUnit(reason: string): HermesJudgment {
  return {
    hasActionUnit: false,
    candidates: ['보류'],
    primary: '보류',
    reason_brief: reason,
  };
}

/** 기준 사례·키워드 기반. Phase 0은 단순 룰 우선. */
function isChitchat(text: string): boolean {
  const t = text.replace(/\s+/g, '');
  if (t.length <= 2) return true;
  const greetings = [
    '안녕',
    '안녕하세요',
    '하이',
    'ㅎㅇ',
    '헬로',
    'hi',
    'hello',
    '고마워',
    '감사',
    'ㄱㅅ',
  ];
  return greetings.some((g) => t === g || t.startsWith(g));
}

/**
 * 변화 신호만 인정.
 * 이전 버전 길이 기반(≥8) 인정이 날씨 등 false positive를 만들었음.
 */
function detectChange(text: string, _understanding: string): boolean {
  const changeSignals = [
    /중요/,
    /달라/,
    /다르/,
    /바꾸/,
    /수정/,
    /갱신/,
    /기록해/,
    /남겨/,
    /저장해/,
    /적어/,
    /남길/,
    /전에\s*말한/,
    /이전/,
    /모르겠어/,
    /확인/,
    /연결/,
    /관련/,
    /\?/,
  ];
  return changeSignals.some((re) => re.test(text));
}

function detectNeed(text: string): boolean {
  const noNeed = [/^(알겠어|응|네|ㅇㅋ|ok|됐어|알겠음)$/i];
  if (noNeed.some((re) => re.test(text.trim()))) return false;
  return true;
}

function mapCandidates(
  text: string,
  _understanding: string,
  related_refs?: string[]
): ActionCandidate[] {
  const out: ActionCandidate[] = [];

  // 남김
  if (/기록해|남겨|저장해|적어|남길/.test(text)) {
    out.push('남김');
  }

  // 이해 갱신
  if (/달라|다르|바꾸|수정|갱신|중요|전에\s*말한/.test(text)) {
    out.push('이해갱신');
  }

  // 확인 질문 — ADR: 중요해 / 달라에도 포함
  if (
    /모르겠어|확인|뭐야|어떤|어떻게|왜|중요|달라|다르/.test(text) ||
    text.includes('?')
  ) {
    out.push('확인질문');
  }

  // 연결
  if (
    /전에\s*말한|이전|연결|관련|그때/.test(text) ||
    (related_refs && related_refs.length > 0 && /달라|다르/.test(text))
  ) {
    out.push('연결');
  }

  // 보류 — ADR: 잘 모르겠어에 보류 포함
  if (/모르겠어|나중에|일단|보류|천천히/.test(text)) {
    out.push('보류');
  }

  // 아무 후보도 없으면 보류만 (이후 evaluate에서 AU 아님 처리)
  if (out.length === 0) {
    out.push('보류');
  }

  return [...new Set(out)];
}

function pickPrimary(candidates: ActionCandidate[]): ActionCandidate {
  // 보류는 최후. 실행성 후보 우선.
  const order: ActionCandidate[] = [
    '이해갱신',
    '남김',
    '확인질문',
    '연결',
    '보류',
  ];
  for (const c of order) {
    if (candidates.includes(c)) return c;
  }
  return '보류';
}

/**
 * systemPrompt에 넣을 Hermes 힌트 문자열 생성.
 * 실행 지시 금지. 제안만.
 */
export function formatHermesHint(judgment: HermesJudgment): string {
  if (!judgment.hasActionUnit) {
    return (
      '\n\n[Hermes Phase0] Action Unit 없음. 보류. 불필요한 제안 하지 말 것.'
    );
  }
  return (
    '\n\n[Hermes Phase0 제안 — 실행하지 말 것. 사람에게만 제안]\n' +
    `후보: ${judgment.candidates.join(', ')}\n` +
    `우선: ${judgment.primary ?? '보류'}\n` +
    '문장 예: 이해 갱신이 필요해 보입니다 / 마당에 남길까요? / 확인이 필요합니다 등.\n' +
    '자동으로 남기거나 이해를 바꾸지 말 것. 제안만 할 것.'
  );
}
