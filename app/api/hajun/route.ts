// app/api/hajun/route.ts
// BRAINPOOL 계약: throw 금지, _error 필드 사용, 200/500만
// action: contexts | snapshots | update_context | chat | summarize_context
// 채팅: Groq (llama-3.3-70b-versatile) / 요약: Gemini 2.5 Flash

import { supabaseGet, supabasePatch } from '@/lib/supabase';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GEMINI_KEY  = process.env.GEMINI_API_KEY!;
const GROQ_KEY    = process.env.GROQ_API_KEY!;
const HOUSE_ID    = '6341b872-4555-4fdc-8f1d-8009b2b1764f';

function createTraceId() {
  return 'tr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ── MindWorld 최신 결과 ───────────────────────────────────────
async function fetchMindWorldSummary(): Promise<string> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/corenull_rooms?house_id=eq.${HOUSE_ID}&order=updated_at.desc&limit=5`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
    );
    if (!res.ok) return '씨앗 데이터 없음';
    const rooms = await res.json();
    if (!rooms || rooms.length === 0) return '씨앗 데이터 없음';
    return rooms
      .map((r: { name?: string; fruit_state?: string; updated_at?: string }) =>
        `- ${r.name || '이름없음'} (${r.fruit_state || 'unknown'}) | ${r.updated_at?.slice(0, 10) || ''}`
      )
      .join('\n');
  } catch {
    return '씨앗 데이터 조회 실패';
  }
}

// ── contexts 최신 1건 ─────────────────────────────────────────
async function fetchContextSummary(): Promise<string> {
  try {
    const data = await supabaseGet('contexts?order=updated_at.desc&limit=1');
    if (!data || data.length === 0) return '개발 맥락 없음';
    const c = data[0];
    const parts: string[] = [];
    if (c.phase) parts.push(`페이즈: ${c.phase}`);
    if (c.status) parts.push(`상태: ${c.status}`);
    if (c.last_task) parts.push(`마지막 작업: ${c.last_task}`);
    if (c.next_action) parts.push(`다음 액션: ${c.next_action}`);
    if (c.current_problems && c.current_problems !== '없음')
      parts.push(`현재 문제: ${c.current_problems}`);
    if (c.summary) parts.push(`요약: ${c.summary}`);
    if (Array.isArray(c.next_tasks) && c.next_tasks.length > 0)
      parts.push(`다음 작업:\n${c.next_tasks.map((t: string) => `  - ${t}`).join('\n')}`);
    return parts.join('\n') || '맥락 데이터 파싱 실패';
  } catch {
    return '개발 맥락 조회 실패';
  }
}

// ── 대화 저장 ─────────────────────────────────────────────────
async function saveConversation(payload: {
  source_ai: string;
  original_message: string;
  summary: string;
  keywords: string[];
}) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/hajunai_conversations`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ...payload, created_at: new Date().toISOString() }),
    });
  } catch { /* 저장 실패해도 응답은 반환 */ }
}

// ── Groq 호출 (채팅용) ────────────────────────────────────────
async function callGroq(
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: string; content: string }>
) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
    { role: 'user', content: userMessage },
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages,
      temperature: 0.4,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { _error: `Groq API 오류: ${errText}` };
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { text };
}

// ── Observations 파싱 ─────────────────────────────────────────
function parseReply(raw: string): { reply: string; observations: string[] } {
  const obsMarkers = ['관찰:', '관찰 :', 'Observations:', '관찰사항:'];
  let splitIdx = -1;
  let marker = '';
  for (const m of obsMarkers) {
    const idx = raw.indexOf(m);
    if (idx !== -1 && (splitIdx === -1 || idx < splitIdx)) {
      splitIdx = idx;
      marker = m;
    }
  }
  if (splitIdx === -1) return { reply: raw.trim(), observations: [] };

  const reply = raw.slice(0, splitIdx).trim();
  const obsPart = raw.slice(splitIdx + marker.length).trim();
  const observations = obsPart
    .split('\n')
    .map((l) => l.replace(/^[-–•*]\s*/, '').trim())
    .filter(Boolean);
  return { reply, observations };
}

// ═══════════════════════════════════════════════════════════════
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    if (action === 'contexts') {
      const data = await supabaseGet('contexts?order=updated_at.desc&limit=1');
      return Response.json({ payload: data[0] || null });
    }

    if (action === 'snapshots') {
      const limit = searchParams.get('limit') || '20';
      const aiFilter = searchParams.get('ai');
      let path = `hajunai_conversations?order=created_at.desc&limit=${limit}`;
      if (aiFilter) path += `&source_ai=eq.${encodeURIComponent(aiFilter)}`;
      const data = await supabaseGet(path);
      return Response.json({ payload: data });
    }

    return Response.json({ _error: '알 수 없는 action' }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const traceId = createTraceId();

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody.replace(/^\uFEFF/, ''));

    // ── update_context ─────────────────────────────────────────
    if (action === 'update_context') {
      const { id, ...fields } = body;
      if (!id) return Response.json({ _error: 'id 필요', traceId }, { status: 200 });
      const data = await supabasePatch('contexts', id, {
        ...fields,
        updated_at: new Date().toISOString(),
      });
      return Response.json({ payload: data[0] || null, traceId });
    }

    // ── chat (Groq) ────────────────────────────────────────────
    if (action === 'chat') {
      const { message, history = [] } = body as {
        message: string;
        history: Array<{ role: string; content: string }>;
      };

      if (!message || typeof message !== 'string' || message.trim() === '') {
        return Response.json({ _error: '메시지가 비어있습니다', traceId }, { status: 200 });
      }
      if (!GROQ_KEY) {
        return Response.json({ _error: 'GROQ_API_KEY 환경변수 미설정', traceId }, { status: 200 });
      }

      const [contextSummary, mindWorldSummary] = await Promise.all([
        fetchContextSummary(),
        fetchMindWorldSummary(),
      ]);

      const systemPrompt = `당신은 HajunAI입니다. BRAINPOOL 프로젝트의 개인 전략 비서입니다.
질문에 단순히 답하는 AI가 아니라, 프로젝트와 삶의 흐름을 이해하고
현재 상태를 분석하여 다음에 필요한 것을 알려주는 비서입니다.

규칙:
- 핵심만 간결하게 답하세요.
- 마크다운 금지 (**, ##, - 목록 등 사용하지 말 것).
- 한국어로만 답하세요.
- 제안은 하되 강요하지 않습니다. 사용자 대신 결정하지 않습니다.
- 필요하다고 판단되면 답변 끝에 "관찰:" 섹션을 추가하세요.
  형식: 관찰:\n- 항목1\n- 항목2

현재 개발 맥락:
${contextSummary}

현재 씨앗/공간 상태 (MindWorld):
${mindWorldSummary}`;

      const groqResult = await callGroq(systemPrompt, message.trim(), history);
      if (groqResult._error) {
        return Response.json({ _error: groqResult._error, traceId }, { status: 200 });
      }

      const { reply, observations } = parseReply(groqResult.text || '');

      saveConversation({
        source_ai: 'HajunAI',
        original_message: `[사용자] ${message}\n[HajunAI] ${reply}`,
        summary: reply.slice(0, 100),
        keywords: ['chat', 'hajunai'],
      });

      return Response.json({ reply, observations, traceId });
    }

    // ── summarize_context (Gemini 2.5 Flash) ──────────────────
    if (action === 'summarize_context') {
      if (!GEMINI_KEY) {
        return Response.json({ _error: 'GEMINI_API_KEY 환경변수 미설정', traceId }, { status: 200 });
      }

      let allConversations = '';
      try {
        const convData = await supabaseGet(
          'hajunai_conversations?order=created_at.asc&select=original_message,source_ai,created_at'
        );
        if (!convData || convData.length === 0) {
          return Response.json({ _error: '저장된 대화가 없습니다', traceId }, { status: 200 });
        }
        allConversations = convData
          .map((c: { source_ai?: string; original_message?: string; created_at?: string }) =>
            `[${c.created_at?.slice(0, 10) || ''}][${c.source_ai || 'AI'}]\n${c.original_message || ''}`
          )
          .join('\n\n---\n\n');
      } catch {
        return Response.json({ _error: '대화 데이터 조회 실패', traceId }, { status: 200 });
      }

      const currentContext = await fetchContextSummary();

      const summarizePrompt = `You are a JSON-only output machine. Do not write any text outside of the JSON object. No markdown. No explanation. No code fences. Just raw JSON.

Output exactly this structure:
{"last_task":"...","summary":"...","next_action":"...","current_problems":"..."}

Rules:
- last_task: 가장 최근 핵심 작업 (80자 이내, 한 줄)
- summary: 전체 프로젝트 현재 상태 (150자 이내, 한 줄, 줄바꿈 없음)
- next_action: 지금 당장 할 것 (한 줄, 예: "구현: CoreHub API - /api/corehub")
- current_problems: 현재 문제점 (없으면 "없음")
- 모든 값은 한국어, 쌍따옴표 내 줄바꿈 금지

기존 맥락:
${currentContext}

전체 대화 기록:
${allConversations}`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: summarizePrompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048,
              responseMimeType: 'application/json',
            },
          }),
        }
      );

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return Response.json({ _error: `Gemini 오류: ${errText}`, traceId }, { status: 200 });
      }

      const geminiData = await geminiRes.json();
      // thinking 블록 제거 후 text parts만 수집
      const parts = geminiData.candidates?.[0]?.content?.parts || [];
      const rawText = parts
        .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
        .map((p: { text: string }) => p.text)
        .join('');

      let parsed: Record<string, string> = {};
      try {
        // 1차: ```json 블록 추출
        const fenceMatch = rawText.match(/```json\s*([\s\S]*?)```/);
        const candidate = fenceMatch ? fenceMatch[1] : rawText;
        // 2차: { } 범위 추출 (가장 바깥 중괄호)
        const objMatch = candidate.match(/\{[\s\S]*\}/);
        if (!objMatch) throw new Error('JSON 객체 없음');
        // 3차: 줄바꿈/제어문자 정리 후 파싱
        const cleaned = objMatch[0]
          .replace(/[\u0000-\u001F&&[^\n\r\t]]/g, ' ')
          .replace(/,\s*([\]}])/g, '$1'); // trailing comma 제거
        parsed = JSON.parse(cleaned);
      } catch (parseErr) {
        // 4차 fallback: 정규식으로 필드별 직접 추출
        const extract = (key: string) => {
          const m = rawText.match(new RegExp(`"${key}"\s*:\s*"([^"]*)"`, 's'));
          return m ? m[1].trim() : '';
        };
        parsed = {
          last_task:        extract('last_task'),
          summary:          extract('summary'),
          next_action:      extract('next_action'),
          current_problems: extract('current_problems') || '없음',
        };
        // 4차도 전부 비어있으면 에러
        if (!parsed.last_task && !parsed.summary && !parsed.next_action) {
          return Response.json({ _error: 'Gemini 응답 파싱 실패', raw: rawText.slice(0, 300), traceId }, { status: 200 });
        }
      }

      return Response.json({
        summary: {
          last_task: parsed.last_task || '',
          summary: parsed.summary || '',
          next_action: parsed.next_action || '',
          current_problems: parsed.current_problems || '없음',
        },
        traceId,
      });
    }

    return Response.json({ _error: '알 수 없는 action', traceId }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
  }
}