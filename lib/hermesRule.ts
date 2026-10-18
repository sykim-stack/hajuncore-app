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
 * - 이건 중요해 → 있음 / 이해갱신 (+확인질문)
 * - 전에 말한 것과 달라 → 있음 / 이해갱신 + 연결 + 확인질문
 * - 이건 기록해줘 → 있음 / 남김
 * - 잘 모르겠어 → 있음 / 확인질문 + 보류
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

  // ② 변화 (Change)
  const hasChange = detectChange(text, understanding);
  if (!hasChange) return noUnit('변화 없음');

  // ③ 필요 (Need)
  const hasNeed = detectNeed(text);
  if (!hasNeed) return noUnit('필요 없음');

  // ④ 방향 (Direction) — 5후보 중 하나라도 매핑 가능하면 true
  const candidates = mapCandidates(text, understanding, input.related_refs);
  if (candidates.length === 0) {
    return noUnit('방향 표현 불가');
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

function detectChange(text: string, understanding: string): boolean {
  // '중요해'는 '하'+'여' 축약이라 /중요하/가 아니라 /중요/로 매칭
  const changeSignals = [
    /중요/,
    /달라/,
    /다르/,
    /바꾸/,
    /수정/,
    /갱신/,
    /기록해/,
    /남겨/,
    /전에\s*말한/,
    /이전/,
    /모르겠어/,
    /확인/,
    /연결/,
  ];
  if (changeSignals.some((re) => re.test(text))) return true;
  // 이해와 내용이 겹치지 않는 새로운 의미 있는 문장
  if (understanding && text.length >= 8) return true;
  if (!understanding && text.length >= 6) return true;
  return false;
}

function detectNeed(text: string): boolean {
  // 단순 감탄/완료 보고만 있으면 false
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

  // 이해 갱신 ('중요해' 축약 대응: 중요)
  if (/달라|다르|바꾸|수정|갱신|중요|전에\s*말한/.test(text)) {
    out.push('이해갱신');
  }

  // 확인 질문
  if (/모르겠어|확인|뭐야|어떤|어떻게|왜/.test(text) || text.includes('?')) {
    out.push('확인질문');
  }

  // 연결
  if (
    /전에\s*말한|이전|연결|관련|그때/.test(text) ||
    (related_refs && related_refs.length > 0 && /달라|다르/.test(text))
  ) {
    out.push('연결');
  }

  // 위 네 개에 안 걸리면 보류
  if (out.length === 0) {
    out.push('보류');
  } else if (!out.includes('보류') && /나중에|일단|보류|천천히/.test(text)) {
    out.push('보류');
  }

  return [...new Set(out)];
}

function pickPrimary(candidates: ActionCandidate[]): ActionCandidate {
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
