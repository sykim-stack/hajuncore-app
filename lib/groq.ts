// lib/groq.ts
// 공용 Groq 호출 함수 — 관제 Chat과 개발 Chat(관제 하준아이 참여자)이 공유한다.

const GROQ_KEY = process.env.GROQ_API_KEY!;

export async function callGroq(
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: string; content: string }> = []
): Promise<{ text?: string; _error?: string }> {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
    { role: 'user', content: userMessage },
  ];

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.4,
        max_tokens: 1024,
      }),
    });
    if (!res.ok) return { _error: `Groq API 오류: ${await res.text()}` };
    const data = await res.json();
    return { text: data.choices?.[0]?.message?.content || '' };
  } catch (e) {
    return { _error: e instanceof Error ? e.message : String(e) };
  }
}