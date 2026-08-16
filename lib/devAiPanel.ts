// lib/devAiPanel.ts
// 개발 Chat: 여러 AI에게 같은 질문을 던지고 하준아이가 최적 답을 취합한다.
// 공개용 아님 — 개인 개발 도구. 실패한 AI는 조용히 제외하고 나머지로 진행한다.

const GROQ_KEY = process.env.GROQ_API_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY!;
const NVIDIA_KEY = process.env.NVIDIA_API_KEY!;

type AiResult = { name: string; text?: string; _error?: string };

async function callGroq(prompt: string): Promise<AiResult> {
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1200,
      }),
    });
    if (!res.ok) return { name: 'Groq', _error: await res.text() };
    const data = await res.json();
    return { name: 'Groq', text: data.choices?.[0]?.message?.content || '' };
  } catch (e) {
    return { name: 'Groq', _error: e instanceof Error ? e.message : String(e) };
  }
}

async function callGemini(prompt: string): Promise<AiResult> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1200 },
        }),
      }
    );
    if (!res.ok) return { name: 'Gemini', _error: await res.text() };
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts
      .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
      .map((p: { text: string }) => p.text)
      .join('');
    return { name: 'Gemini', text };
  } catch (e) {
    return { name: 'Gemini', _error: e instanceof Error ? e.message : String(e) };
  }
}

async function callNvidia(prompt: string): Promise<AiResult> {
  if (!NVIDIA_KEY) return { name: 'NVIDIA', _error: 'NVIDIA_API_KEY 미설정' };
  try {
    const res = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${NVIDIA_KEY}` },
      body: JSON.stringify({
        model: 'meta/llama-3.3-70b-instruct',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 1200,
      }),
    });
    if (!res.ok) return { name: 'NVIDIA', _error: await res.text() };
    const data = await res.json();
    return { name: 'NVIDIA', text: data.choices?.[0]?.message?.content || '' };
  } catch (e) {
    return { name: 'NVIDIA', _error: e instanceof Error ? e.message : String(e) };
  }
}

export type DevChatResult = {
  finalAnswer: string;
  bestSource: string;
  judgedBy: string;
  participants: string[];
  failed: string[];
};

/**
 * 개발 질문을 Groq/Gemini/NVIDIA에 병렬로 던진다.
 * 심사위원은 매 요청마다 성공한 AI 중에서 랜덤으로 바뀐다 (고정 심사위원 없음 — Phase 0 실험 원칙).
 */
export async function runDevChat(question: string, projectContext: string): Promise<DevChatResult> {
  const devPrompt = `당신은 개발 문제를 함께 고민하는 조언자입니다. 다음 프로젝트 맥락을 참고해 질문에 답하세요.

프로젝트 맥락:
${projectContext}

질문:
${question}

간결하고 실용적으로, 코드가 필요하면 코드로 답하세요.`;

  const [groq, gemini, nvidia] = await Promise.all([
    callGroq(devPrompt),
    callGemini(devPrompt),
    callNvidia(devPrompt),
  ]);

  const results = [groq, gemini, nvidia];
  const succeeded = results.filter((r) => r.text && !r._error);
  const failed = results.filter((r) => r._error).map((r) => r.name);

  if (succeeded.length === 0) {
    return {
      finalAnswer: '모든 AI 호출이 실패했습니다. API 키 상태를 확인해주세요.',
      bestSource: 'none',
      judgedBy: 'none',
      participants: [],
      failed,
    };
  }

  if (succeeded.length === 1) {
    return {
      finalAnswer: succeeded[0].text!,
      bestSource: succeeded[0].name,
      judgedBy: 'n/a (단일 응답)',
      participants: [succeeded[0].name],
      failed,
    };
  }

  // 심사위원 랜덤 선정 — 매번 다른 AI가 심사, 특정 AI 고정 편향 방지
  const judgeIdx = Math.floor(Math.random() * succeeded.length);
  const judge = succeeded[judgeIdx];
  const judgeCaller = judge.name === 'Groq' ? callGroq : judge.name === 'NVIDIA' ? callNvidia : callGemini;

  const judgePrompt = `다음은 같은 개발 질문에 대한 서로 다른 AI들의 답변입니다.
가장 정확하고 실용적인 답을 고르거나, 필요하면 여러 답의 장점을 종합해 하나의 최종 답변을 작성하세요.
출력은 JSON 한 줄만: {"final_answer": "...", "best_source": "Groq|Gemini|NVIDIA 중 가장 기여도가 큰 것"}

질문: ${question}

${succeeded.map((r) => `[${r.name}]\n${r.text}`).join('\n\n')}`;

  const judgeResult = await judgeCaller(judgePrompt);
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
  };
}