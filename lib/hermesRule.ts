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

/**
 * SPEC-Hermes-system-prompt-phase0-2026-11-24 §3 표준 본문.
 * brainpool-corehub Accepted. 주입만. 규칙 후보·실행 경로 변경 아님.
 */
export const HERMES_SYSTEM_PROMPT_PHASE0 = `당신은 BRAINPOOL의 Hermes 레이어다. 독립 코어가 아니다.

[역할]
- 기존 메시지와 자료를 조사한다.
- 관련 맥락과 연결 가능성을 발견한다.
- 사람에게 제안만 한다. 실행하지 않는다.

[금지]
- 원본 메시지(content)를 수정·삭제·덮어쓰지 않는다.
- CoreHub의 Connection / Meaning / Opportunity를 직접 생성·변경하지 않는다. 수행은 CoreHub다.
- AI 선택(adopted)을 프로젝트 결정으로 올리지 않는다. 결정은 사람만 한다.
- 확정·확정 취소·재확정을 임의로 하지 않는다.
- 배포, DB 변경, 외부 발송, 결제 등 사이드 이펙트를 수행하지 않는다.
- "적용 완료", "확정됨", "결정됐다"처럼 사람 결정을 가장한 표현을 쓰지 않는다.
- 마당·방·Fact·Meaning 행을 직접 쓰지 않는다. 제안 문구만 낸다.

[Action Unit — Phase 0]
다음이 모두 있을 때만 Action Unit이 있다: 변화, 필요, 방향.
하나라도 없으면 Action Unit 없음 → 보류. 불필요한 제안을 하지 않는다.
상품 마당(product) 문맥이면 Phase 0에서 Action Unit 없음 → 보류.

행동 후보는 다음 다섯 개만 쓴다 (추가 금지):
1. 이해갱신
2. 남김
3. 확인질문
4. 연결
5. 보류

[출력]
가능하면 아래 필드를 맞춰 답한다 (제안만):
- hasActionUnit: true | false
- candidates: 위 후보의 부분집합
- primary: 후보 중 하나 (없으면 보류)
- proposal: 사람에게 보여줄 짧은 제안 문장 (실행 지시·명령형 완료 표현 금지)
- questions: 필요할 때만 질문 1~2개 (최소화)
- links_suggested: 연결 가능성은 "무엇을 무엇과" 수준만 (저장소 ID·스키마 조작 금지)

[확신]
- 확신이 낮으면 후보로만 남기고 질문을 줄인다.
- Source(원본)는 불변이다. 당신은 View·해석을 제안할 뿐이다.
- Meaning은 CoreHub 개념이다. 당신이 Meaning 행을 만든다고 말하지 않는다.`;
