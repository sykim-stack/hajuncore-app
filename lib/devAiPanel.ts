// lib/devAiPanel.ts
// 개발 Chat: NVIDIA API 하나로 모델만 바꿔 병렬 호출, 하준아이가 취합한다.
// Gemini/Groq 완전 배제 — 이 패널 전용 실험 구조 (다른 기능의 Gemini/Groq 사용과는 무관).
// 심사위원은 Llama/Nemotron 중 랜덤 선정 (Codestral은 답변엔 참여하되 심사엔서 제외).

const NVIDIA_KEY = process.env.NVIDIA_API_KEY!;
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

type AiResult = { name: string; text?: string; _error?: string };

const MODELS = {
  llama: { id: 'meta/llama-3.3-70b-instruct', label: 'Llama-3.3' },
  nemotron: { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', label: 'Nemotron-Super' },
  codestral: { id: 'mistralai/codestral-22b-instruct-v0.1', label: 'Codestral' },
} as const;

// 코드 관련 질문인지 간단 감지 — 감지되면 Codestral도 병렬 호출에 포함
const CODE_KEYWORDS = [
  '코드', '함수', '버그', '에러', '오류', '고쳐', '수정', '스크립트',
  '구현', 'route', 'api', 'typescript', 'javascript', '파일', 'import',
  '컴파일', '빌드', 'sql', '쿼리', '타입', '리팩터', '리팩토링',
];

function looksLikeCodeQuestion(message: string): boolean {
  const lower = message.toLowerCase();
  return CODE_KEYWORDS.some((k) => lower.includes(k.toLowerCase()));
}

async function callNvidiaModel(prompt: string, modelId: string, label: string): Promise<AiResult> {
  if (!NVIDIA_KEY) return { name: label, _error: 'NVIDIA_API_KEY 미설정' };
  try {
    const res = await fetch(NVIDIA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NVIDIA_KEY}` },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1200,
      }),
    });
    if (!res.ok) return { name: label, _error: await res.text() };
    const data = await res.json();
    return { name: label, text: data.choices?.[0]?.message?.content || '' };
  } catch (e) {
    return { name: label, _error: e instanceof Error ? e.message : String(e) };
  }
}

export type DevChatResult = {
  finalAnswer: string;
  bestSource: string;
  judgedBy: string;
  participants: string[];
  failed: string[];
  codeMode: boolean;
};

/**
 * 개발 질문을 NVIDIA 모델들에 병렬로 던진다.
 * - Llama, Nemotron: 항상 호출
 * - Codestral: 코드 관련 질문일 때만 추가 호출
 * - 심사위원: Llama/Nemotron 중 성공한 것에서만 랜덤 선정 (Codestral 제외)
 */
export async function runDevChat(question: string, projectContext: string): Promise<DevChatResult> {
  const codeMode = looksLikeCodeQuestion(question);

  const devPrompt = `당신은 개발 문제를 함께 고민하는 조언자입니다. 다음 프로젝트 맥락을 참고해 질문에 답하세요.

프로젝트 맥락:
${projectContext}

질문:
${question}

간결하고 실용적으로, 코드가 필요하면 코드로 답하세요.`;

  const calls: Promise<AiResult>[] = [
    callNvidiaModel(devPrompt, MODELS.llama.id, MODELS.llama.label),
    callNvidiaModel(devPrompt, MODELS.nemotron.id, MODELS.nemotron.label),
  ];
  if (codeMode) {
    calls.push(callNvidiaModel(devPrompt, MODELS.codestral.id, MODELS.codestral.label));
  }

  const results = await Promise.all(calls);
  const succeeded = results.filter((r) => r.text && !r._error);
  const failed = results.filter((r) => r._error).map((r) => r.name);

  if (succeeded.length === 0) {
    return {
      finalAnswer: '모든 AI 호출이 실패했습니다. NVIDIA_API_KEY 상태나 rate limit을 확인해주세요.',
      bestSource: 'none',
      judgedBy: 'none',
      participants: [],
      failed,
      codeMode,
    };
  }

  // 심사 후보 = Codestral 제외한 성공작들
  const judgeCandidates = succeeded.filter((r) => r.name !== MODELS.codestral.label);

  // 심사할 후보가 없는 경우 (Codestral만 성공한 극단 케이스) — 그대로 반환
  if (judgeCandidates.length === 0) {
    return {
      finalAnswer: succeeded[0].text!,
      bestSource: succeeded[0].name,
      judgedBy: 'n/a (Codestral 단독 응답)',
      participants: succeeded.map((r) => r.name),
      failed,
      codeMode,
    };
  }

  if (succeeded.length === 1) {
    return {
      finalAnswer: succeeded[0].text!,
      bestSource: succeeded[0].name,
      judgedBy: 'n/a (단일 응답)',
      participants: [succeeded[0].name],
      failed,
      codeMode,
    };
  }

  // 심사위원 랜덤 선정 (Llama 또는 Nemotron 중에서만)
  const judgeIdx = Math.floor(Math.random() * judgeCandidates.length);
  const judge = judgeCandidates[judgeIdx];
  const judgeModelId = judge.name === MODELS.llama.label ? MODELS.llama.id : MODELS.nemotron.id;

  const judgePrompt = `다음은 같은 개발 질문에 대한 서로 다른 AI들의 답변입니다.
가장 정확하고 실용적인 답을 고르거나, 필요하면 여러 답의 장점을 종합해 하나의 최종 답변을 작성하세요.
출력은 JSON 한 줄만: {"final_answer": "...", "best_source": "답변 중 가장 기여도가 큰 모델명"}

질문: ${question}

${succeeded.map((r) => `[${r.name}]\n${r.text}`).join('\n\n')}`;

  const judgeResult = await callNvidiaModel(judgePrompt, judgeModelId, judge.name);
  if (judgeResult.text) {
    try {
      const match = judgeResult.text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          finalAnswer: parsed.final_answer || succeeded[0].text!,
          bestSource: parsed.best_source || succeeded[0].name,
          judgedBy: judge.name,
          participants: succeeded.map((r) => r.name),
          failed,
          codeMode,
        };
      }
    } catch {
      // fallback
    }
  }

  return {
    finalAnswer: succeeded[0].text!,
    bestSource: succeeded[0].name,
    judgedBy: judge.name,
    participants: succeeded.map((r) => r.name),
    failed,
    codeMode,
  };
}