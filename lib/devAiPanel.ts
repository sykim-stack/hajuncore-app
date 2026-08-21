// lib/devAiPanel.ts
// 개발 Chat: NVIDIA 3모델(Llama/Nemotron/Codestral) + 관제 하준아이(Groq) 참여.
// 심사위원은 Llama/Nemotron 중에서만 랜덤 선정 — Codestral, 관제 하준아이는 심사 후보 제외.
// 모든 응답(채택 여부 무관)을 hajun_posts에 저장한다 (CoreNull "채택=보존 아님" 원칙).
// 병렬 호출 → 직렬(순차) 호출로 변경, 요청 간 2초 대기, NVIDIA 타임아웃 60초, 지수 백오프 재시도 적용.

import { callGroq } from '@/lib/groq';
import { fetchContextSummary, fetchMindWorldSummary } from '@/lib/context';
import { fetchLanguageKnowledge, buildLanguageKnowledgeBlock } from '@/lib/languageKnowledge';
import { fetchRecentWorkLogs, buildWorkLogBlock } from '@/lib/workLog';
import { getEngineRoomId, classifyEngineRoom, saveHajunPosts, fetchCurrentPhase, type HajunPostInput } from '@/lib/hajunRooms';

const NVIDIA_KEY = process.env.NVIDIA_API_KEY!;
const NVIDIA_ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

const GROQ_LABEL = '🧠 관제 하준아이 (Context Baseline)';
const GROQ_MODEL_USED = 'openai/gpt-oss-120b'; // lib/groq.ts와 동일하게 유지 필요

type AiResult = { name: string; agent: string; model: string; text?: string; _error?: string };

const MODELS = {
  llama: { id: 'meta/llama-3.3-70b-instruct', label: 'Llama-3.3', agent: 'nvidia_llama' },
  nemotron: { id: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', label: 'Nemotron-Super', agent: 'nvidia_nemotron' },
  codestral: { id: 'mistralai/codestral-22b-instruct-v0.1', label: 'Codestral', agent: 'nvidia_codestral' },
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

// ---------- NVIDIA 호출 (타임아웃 60초, 지수 백오프 재시도) ----------
async function callNvidiaModel(
  prompt: string,
  modelId: string,
  label: string,
  agent: string
): Promise<AiResult> {
  if (!NVIDIA_KEY) return { name: label, agent, model: modelId, _error: 'NVIDIA_API_KEY 미설정' };

  const attemptFetch = async (): Promise<AiResult> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60초 타임아웃
    try {
      const res = await fetch(NVIDIA_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${NVIDIA_KEY}`,
        },
        body: JSON.stringify({
          model: modelId,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 1200,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) {
        const errText = await res.text();
        return { name: label, agent, model: modelId, _error: `HTTP ${res.status}: ${errText}` };
      }
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content || '';
      return { name: label, agent, model: modelId, text };
    } catch (e) {
      clearTimeout(timeout);
      return { name: label, agent, model: modelId, _error: e instanceof Error ? e.message : String(e) };
    }
  };

  // 지수 백오프: 2초 → 5초 (abort/fetch/timeout/ECONN... 만 재시도)
  const delays = [2000, 5000];
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    const result = await attemptFetch();
    if (!result._error) return result;

    const errMsg = result._error.toLowerCase();
    const isRetryable =
      errMsg.includes('fetch') ||
      errMsg.includes('abort') ||
      errMsg.includes('timeout') ||
      errMsg.includes('econnreset') ||
      errMsg.includes('econnrefused');

    if (isRetryable && attempt < delays.length) {
      console.warn(`[NVIDIA] ${label} (${modelId}) 재시도 ${attempt + 1}/${delays.length}... (${delays[attempt]}ms 후)`);
      await new Promise((r) => setTimeout(r, delays[attempt]));
      continue;
    }
    return result;
  }

  return { name: label, agent, model: modelId, _error: 'Max retries exceeded' };
}

// ---------- Groq 참가자 (관제 하준아이) ----------
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
    if (result._error) return { name: GROQ_LABEL, agent: 'hajun_control', model: GROQ_MODEL_USED, _error: result._error };
    return { name: GROQ_LABEL, agent: 'hajun_control', model: GROQ_MODEL_USED, text: result.text };
  } catch (e) {
    return { name: GROQ_LABEL, agent: 'hajun_control', model: GROQ_MODEL_USED, _error: e instanceof Error ? e.message : String(e) };
  }
}

// ---------- 내부 타입 ----------
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

// ---------- 메인 함수 (직렬 호출로 변경) ----------
export async function runDevChat(question: string, questionRef: string): Promise<DevChatResult> {
  const codeMode = looksLikeCodeQuestion(question);
  const shallowContext = await fetchContextSummary();

  const devPrompt = `당신은 개발 문제를 함께 고민하는 조언자입니다. 다음 프로젝트 맥락을 참고해 질문에 답하세요.

프로젝트 맥락:
${shallowContext}

질문:
${question}

간결하고 실용적으로, 코드가 필요하면 코드로 답하세요.`;

  // ---------- 1. 실행할 태스크 정의 (순차 보장) ----------
  const tasks: { fn: () => Promise<AiResult>; label: string }[] = [
    {
      fn: () => callNvidiaModel(devPrompt, MODELS.llama.id, MODELS.llama.label, MODELS.llama.agent),
      label: MODELS.llama.label,
    },
    {
      fn: () => callNvidiaModel(devPrompt, MODELS.nemotron.id, MODELS.nemotron.label, MODELS.nemotron.agent),
      label: MODELS.nemotron.label,
    },
    {
      fn: () => callGroqParticipant(question),
      label: GROQ_LABEL,
    },
  ];

  // 코드 질문이면 Codestral 추가
  if (codeMode) {
    tasks.push({
      fn: () => callNvidiaModel(devPrompt, MODELS.codestral.id, MODELS.codestral.label, MODELS.codestral.agent),
      label: MODELS.codestral.label,
    });
  }

  // ---------- 2. 순차 실행 (요청 간 2초 대기) ----------
  const results: AiResult[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    if (i > 0) {
      await new Promise((r) => setTimeout(r, 2000)); // 각 요청 사이 2초 대기 (Rate Limit 회피)
    }
    try {
      const result = await task.fn();
      results.push(result);
    } catch (e) {
      results.push({
        name: task.label,
        agent: 'unknown',
        model: 'unknown',
        _error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // ---------- 3. 결과 분류 ----------
  const rawResponses: RawResponse[] = results.map((r) => ({ name: r.name, text: r.text, error: r._error }));
  const succeeded = results.filter((r) => r.text && !r._error);
  const failed = results.filter((r) => r._error).map((r) => r.name);

  // ---------- 4. 심사 (Llama/Nemotron만 후보) ----------
  const judgeCandidates = succeeded.filter(
    (r) => r.agent !== MODELS.codestral.agent && r.agent !== 'hajun_control'
  );

  let finalAnswer: string;
  let bestSource: string;
  let judgedBy: string;

  if (succeeded.length === 0) {
    finalAnswer = '모든 AI 호출이 실패했습니다. API 키 상태나 rate limit을 확인해주세요.';
    bestSource = 'none';
    judgedBy = 'none';
  } else if (judgeCandidates.length === 0) {
    finalAnswer = succeeded[0].text!;
    bestSource = succeeded[0].name;
    judgedBy = 'n/a (Llama/Nemotron 모두 실패)';
  } else if (succeeded.length === 1) {
    finalAnswer = succeeded[0].text!;
    bestSource = succeeded[0].name;
    judgedBy = 'n/a (단일 응답)';
  } else {
    // 랜덤 심사위원 선정
    const judgeIdx = Math.floor(Math.random() * judgeCandidates.length);
    const judge = judgeCandidates[judgeIdx];
    const judgeModelId = judge.agent === MODELS.llama.agent ? MODELS.llama.id : MODELS.nemotron.id;

    const judgePrompt = `다음은 같은 개발 질문에 대한 서로 다른 AI들의 답변입니다.
가장 정확하고 실용적인 답을 고르거나, 필요하면 여러 답의 장점을 종합해 하나의 최종 답변을 작성하세요.
출력은 JSON 한 줄만: {"final_answer": "...", "best_source": "답변 중 가장 기여도가 큰 참여자 이름"}

질문: ${question}

${succeeded.map((r) => `[${r.name}]\n${r.text}`).join('\n\n')}`;

    const judgeResult = await callNvidiaModel(judgePrompt, judgeModelId, judge.name, judge.agent);
    let parsed: { final_answer?: string; best_source?: string } = {};
    if (judgeResult.text) {
      try {
        const match = judgeResult.text.match(/\{[\s\S]*\}/);
        if (match) parsed = JSON.parse(match[0]);
      } catch { /* fallback */ }
    }
    finalAnswer = parsed.final_answer || succeeded[0].text!;
    bestSource = parsed.best_source || succeeded[0].name;
    judgedBy = judge.name;
  }

   // ── hajun_posts 저장 (5개 엔진방 중 하나로 분류, project_ref는 Context 축) ──
  try {
    const room = classifyEngineRoom(question);
    const roomId = await getEngineRoomId(room);
    const projectRef = await fetchCurrentPhase();
    if (roomId) {
      const posts: HajunPostInput[] = results
        .filter((r) => r.text)
        .map((r) => ({
          room_id: roomId,
          project_ref: projectRef,
          author_agent: r.agent,
          model_used: r.model,
          content: r.text!,
          adopted: r.name === bestSource,
          question_ref: questionRef,
        }));
      await saveHajunPosts(posts);
    }
  } catch { /* 저장 실패해도 채팅 흐름은 유지 */ }

  return {
    finalAnswer,
    bestSource,
    judgedBy,
    participants: succeeded.map((r) => r.name),
    failed,
    codeMode,
    rawResponses,
  };
}