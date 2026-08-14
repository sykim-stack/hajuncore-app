// lib/workLog.ts
// HajunAI 작업 완료 로그 — 대화 중 "끝났다"는 신호를 감지해 Gemini로 요약 후 저장한다.
// Owner: HajunAI (클로2). work_logs 테이블은 이 모듈을 통해서만 쓴다.

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY!;

export type WorkLogEntry = {
  id?: string;
  title: string;
  summary: string;
  files_changed?: string[];
  issues?: string | null;
  next_steps?: string | null;
  source?: string;
  raw_trigger_message?: string;
  created_at?: string;
};

// 완료 신호로 볼 수 있는 표현 (v1 휴리스틱 — 오탐 발견되면 튜닝 필요)
const COMPLETION_PATTERNS = [
  '끝났', '끝냈', '완료', '마무리', '다 했', '다했',
  '됐어', '됐습니다', '해결했', '고쳤어', '고쳤습니다',
  '커밋했', '푸시했', '배포했', '반영했',
];
const NEGATION_NEAR = ['안', '못', '아직'];

export function looksLikeCompletion(message: string): boolean {
  if (!message || message.length > 1500) return false; // 너무 길면 일반 대화로 처리
  for (const p of COMPLETION_PATTERNS) {
    const idx = message.indexOf(p);
    if (idx === -1) continue;
    const before = message.slice(Math.max(0, idx - 6), idx);
    if (NEGATION_NEAR.some((n) => before.includes(n))) continue;
    return true;
  }
  return false;
}

// Gemini로 최근 대화 + 완료 메시지를 구조화된 작업 기록으로 요약한다.
// is_completion=false면 저장하지 않는다 (키워드 오탐 방지용 2차 검증).
export async function summarizeWorkLog(
  history: Array<{ role: string; content: string }>,
  triggerMessage: string
): Promise<{ entry?: WorkLogEntry; isCompletion: boolean; _error?: string }> {
  if (!GEMINI_KEY) return { isCompletion: false, _error: 'GEMINI_API_KEY 미설정' };

  const recentHistory = history
    .slice(-10)
    .map((h) => `${h.role === 'user' ? '사용자' : 'HajunAI'}: ${h.content}`)
    .join('\n');

  const prompt = `아래는 최근 대화입니다. 사용자의 마지막 메시지가 실제로 "작업 완료" 보고인지 판단하고,
맞다면 작업 내용을 구조화하세요. 단순 잡담이거나 완료 보고가 아니면 is_completion을 false로 하세요.

출력은 JSON 한 줄만. 마크다운/설명 금지.
{"is_completion": true/false, "title": "...", "summary": "...", "files_changed": ["..."], "issues": "...", "next_steps": "..."}

규칙:
- title: 작업을 한 줄로 (30자 이내)
- summary: 무엇을 왜 어떻게 했는지 (200자 이내)
- files_changed: 언급된 파일/스크립트명만 배열로 (없으면 빈 배열)
- issues: 남은 문제/미해결 사항 (없으면 "없음")
- next_steps: 다음에 할 일 (없으면 "없음")

=== 최근 대화 ===
${recentHistory}

=== 마지막 메시지 (완료 신호로 감지됨) ===
사용자: ${triggerMessage}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024, responseMimeType: 'application/json' },
        }),
      }
    );
    if (!res.ok) return { isCompletion: false, _error: `Gemini 오류: ${await res.text()}` };

    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const rawText = parts
      .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
      .map((p: { text: string }) => p.text)
      .join('');

    const objMatch = rawText.match(/\{[\s\S]*\}/);
    if (!objMatch) return { isCompletion: false, _error: '파싱 실패' };
    const parsed = JSON.parse(objMatch[0]);

    if (!parsed.is_completion) return { isCompletion: false };

    return {
      isCompletion: true,
      entry: {
        title: parsed.title || '작업 완료',
        summary: parsed.summary || '',
        files_changed: Array.isArray(parsed.files_changed) ? parsed.files_changed : [],
        issues: parsed.issues && parsed.issues !== '없음' ? parsed.issues : null,
        next_steps: parsed.next_steps && parsed.next_steps !== '없음' ? parsed.next_steps : null,
        source: 'chat',
        raw_trigger_message: triggerMessage.slice(0, 500),
      },
    };
  } catch (e) {
    return { isCompletion: false, _error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveWorkLog(entry: WorkLogEntry): Promise<{ id?: string; _error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/work_logs`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(entry),
    });
    if (!res.ok) return { _error: `저장 실패: ${await res.text()}` };
    const data = await res.json();
    return { id: data[0]?.id };
  } catch (e) {
    return { _error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchRecentWorkLogs(limit = 5): Promise<WorkLogEntry[]> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/work_logs?order=created_at.desc&limit=${limit}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
    );
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export function buildWorkLogBlock(entries: WorkLogEntry[]): string {
  if (!entries || entries.length === 0) return '최근 작업 기록 없음';
  return entries
    .map((e) => {
      const date = e.created_at ? e.created_at.slice(0, 10) : '';
      const issue = e.issues ? ` | 미해결: ${e.issues}` : '';
      const next = e.next_steps ? ` | 다음: ${e.next_steps}` : '';
      return `- [${date}] ${e.title} — ${e.summary}${issue}${next}`;
    })
    .join('\n');
}