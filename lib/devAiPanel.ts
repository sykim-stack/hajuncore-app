// lib/devAiPanel.ts
// 개발 Chat: NVIDIA 3모델(Llama/Nemotron/Codestral) + 관제 하준아이(Groq, 전체 맥락 보유) 참여.
// 심사위원은 Llama/Nemotron 중에서만 랜덤 선정 — Codestral, Groq는 심사 후보에서 제외.
// 개발 모드는 work_logs에 저장하지 않는다 (순수 토론 공간, 기억은 관제 모드에서만).

import { callGroq } from '@/lib/groq';
import { fetchContextSummary, fetchMindWorldSummary } from '@/lib/context';
import { fetchLanguageKnowledge, buildLanguageKnowledgeBlock } from '@/lib/languageKnowledge';
import { fetchRecentWorkLogs, buildWorkLogBlock } from '@/lib/workLog';

const NVIDIA_KEY = process.env.NVIDIA_API_KEY!;
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

const GROQ_LABEL = '🧠 관제 하준아이 (Context Baseline)';

type AiResult = { name: string; text?: string; _error?: string };

const MODELS = {
  llama: { id: 'lib/groq.ts', label: 'Llama-3.3' },
  nemotron: { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', label: 'Nemotron-Super' },
  codestral: { id: 'mistralai/codestral-22b-instruct-v0.1', label: 'Codestral' },
} as const;

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

// 관제 하준아이용 시스템 프롬프트 — 관제 모드와 동일한 깊이의 맥락(dev_contexts + MindWorld + Language Knowledge + Work Log)을 갖춘다.
async function buildGroqContextPrompt(): Promise<string> {
  const [contextSummary, mindWorldSummary, languageKnowledgeItems, recentWorkLogs] = await Promise.all([
    fetchContextSummary(),
    fetchMindWorldSummary(),
    fetchLanguageKnowledge({ limit: 3 }),
    fetchRecentWorkLogs(5),
  ]);

  const lkBlock = languageKnowledgeItems.length > 0
    ? buildLanguageKnowledgeBlock(languageKnowledgeItems)
    : '관련 언어 지식 없음';

  return `당신은 BRAINPOOL 프로젝트를 속속들이 아는 관제 하준아이입니다.
지금은 개발 Chat(여러 AI가 의견을 내는 토론 공간)에 참여자로서 의견을 냅니다.
다른 AI들과 나란히 비교당하는 답변이니, 아래에 실제로 주어진 정보만 근거로 답하세요.

절대 규칙:
- 아래 맥락 블록에 없는 내용은 지어내지 마세요. 기술 스택, 도구, 파일 구조, CI/CD, 테스트 프레임워크 등을 절대 추측·창작하지 마세요.
- 맥락에 없는 정보가 필요한 질문이면 "이 정보는 현재 맥락에 없습니다"라고 명확히 말하세요.
- 그럴듯하게 들리는 답보다 정직하게 "모른다"고 말하는 것이 훨씬 낫습니다.
- 마크다운 금지, 한국어만 사용, 간결하게.

현재 개발 맥락:
${contextSummary}

현재 씨앗/공간 상태 (MindWorld):
${mindWorldSummary}

관련 언어 지식:
${lkBlock}

최근 작업 기록:
${buildWorkLogBlock(recentWorkLogs)}`;
}

async function callGroqParticipant(question: string): Promise<AiResult> {
  try {
    const systemPrompt = await buildGroqContextPrompt();
    const result = await callGroq(systemPrompt, question, []);
    if (result._error) return { name: GROQ_LABEL, _error: result._error };
    return { name: GROQ_LABEL, text: result.text };
  } catch (e) {
    return { name: GROQ_LABEL, _error: e instanceof Error ? e.message : String(e) };
  }
}

export type RawResponse = { name: string; text?: string; error?: string };

export type DevChatResult = {
  finalAnswer: string;
  bestSource: string;
  judgedBy: string;
  participants: string[];
  failed: string[];
  codeMode: boolean;
  rawResponses: RawResponse[];
};

export async function runDevChat(question: string): Promise<DevChatResult> {
  const codeMode = looksLikeCodeQuestion(question);
  const shallowContext = await fetchContextSummary();

  const devPrompt = `당신은 개발 문제를 함께 고민하는 조언자입니다. 다음 프로젝트 맥락을 참고해 질문에 답하세요.

프로젝트 맥락:
${shallowContext}

질문:
${question}

간결하고 실용적으로, 코드가 필요하면 코드로 답하세요.`;

  const calls: Promise<AiResult>[] = [
    callNvidiaModel(devPrompt, MODELS.llama.id, MODELS.llama.label),
    callNvidiaModel(devPrompt, MODELS.nemotron.id, MODELS.nemotron.label),
    callGroqParticipant(question),
  ];
  if (codeMode) {
    calls.push(callNvidiaModel(devPrompt, MODELS.codestral.id, MODELS.codestral.label));
  }

  const results = await Promise.all(calls);
  const rawResponses: RawResponse[] = results.map((r) => ({
    name: r.name,
    text: r.text,
    error: r._error,
  }));

  const succeeded = results.filter((r) => r.text && !r._error);
  const failed = results.filter((r) => r._error).map((r) => r.name);

  if (succeeded.length === 0) {
    return {
      finalAnswer: '모든 AI 호출이 실패했습니다. API 키 상태나 rate limit을 확인해주세요.',
      bestSource: 'none',
      judgedBy: 'none',
      participants: [],
      failed,
      codeMode,
      rawResponses,
    };
  }

  // 심사 후보 = Codestral, Groq 제외한 순수 NVIDIA 비교군(Llama/Nemotron)만
  const judgeCandidates = succeeded.filter(
    (r) => r.name !== MODELS.codestral.label && r.name !== GROQ_LABEL
  );

  if (judgeCandidates.length === 0) {
    return {
      finalAnswer: succeeded[0].text!,
      bestSource: succeeded[0].name,
      judgedBy: 'n/a (Llama/Nemotron 모두 실패)',
      participants: succeeded.map((r) => r.name),
      failed,
      codeMode,
      rawResponses,
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
      rawResponses,
    };
  }

  const judgeIdx = Math.floor(Math.random() * judgeCandidates.length);
  const judge = judgeCandidates[judgeIdx];
  const judgeModelId = judge.name === MODELS.llama.label ? MODELS.llama.id : MODELS.nemotron.id;

  const judgePrompt = `다음은 같은 개발 질문에 대한 서로 다른 AI들의 답변입니다.
가장 정확하고 실용적인 답을 고르거나, 필요하면 여러 답의 장점을 종합해 하나의 최종 답변을 작성하세요.
출력은 JSON 한 줄만: {"final_answer": "...", "best_source": "답변 중 가장 기여도가 큰 참여자 이름"}

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
          rawResponses,
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
    rawResponses,
  };
}