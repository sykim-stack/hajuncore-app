// app/api/hajun/route.ts
// BRAINPOOL 계약: throw 금지, _error 필드 사용, 200/500만
// action: contexts | snapshots | update_context | chat

import { supabaseGet, supabasePatch } from '@/lib/supabase';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY!;
const HOUSE_ID = '6341b872-4555-4fdc-8f1d-8009b2b1764f';

function createTraceId() {
  return 'tr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ── MindWorld 최신 결과 가져오기 ──────────────────────────────
async function fetchMindWorldSummary(): Promise<string> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/corenull_rooms?house_id=eq.${HOUSE_ID}&order=updated_at.desc&limit=5`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        cache: 'no-store',
      }
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

// ── contexts 최신 1건 가져오기 ────────────────────────────────
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

// ── 대화 hajunai_conversations에 저장 ────────────────────────
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
      body: JSON.stringify({
        ...payload,
        created_at: new Date().toISOString(),
      }),
    });
  } catch {
    // 저장 실패해도 응답은 반환
  }
}

// ── Gemini 호출 ───────────────────────────────────────────────
async function callGemini(systemPrompt: string, userMessage: string, history: Array<{ role: string; content: string }>) {
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // 히스토리 변환 (user/model 교대)
  for (const h of history) {
    contents.push({
      role: h.role === 'user' ? 'user' : 'model',
      parts: [{ text: h.content }],
    });
  }

  // 현재 메시지
  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    return { _error: `Gemini API 오류: ${errText}` };
  }

  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  return { text: raw };
}

// ── Observations 파싱 ─────────────────────────────────────────
// Gemini가 "관찰:" 섹션을 포함하면 분리, 없으면 observations 비어있음
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

  if (splitIdx === -1) {
    return { reply: raw.trim(), observations: [] };
  }

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
    // BOM 제거
    const cleanBody = rawBody.replace(/^\uFEFF/, '');
    const body = JSON.parse(cleanBody);

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

    // ── chat ───────────────────────────────────────────────────
    if (action === 'chat') {
      const { message, history = [] } = body as {
        message: string;
        history: Array<{ role: string; content: string }>;
      };

      if (!message || typeof message !== 'string' || message.trim() === '') {
        return Response.json({ _error: '메시지가 비어있습니다', traceId }, { status: 200 });
      }

      if (!GEMINI_KEY) {
        return Response.json({ _error: 'GEMINI_API_KEY 환경변수 미설정', traceId }, { status: 200 });
      }

      // 맥락 수집
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

      const geminiResult = await callGemini(systemPrompt, message.trim(), history);

      if (geminiResult._error) {
        return Response.json({ _error: geminiResult._error, traceId }, { status: 200 });
      }

      const { reply, observations } = parseReply(geminiResult.text || '');

      // 대화 저장 (비동기, 실패해도 무시)
      saveConversation({
        source_ai: 'HajunAI',
        original_message: `[사용자] ${message}\n[HajunAI] ${reply}`,
        summary: reply.slice(0, 100),
        keywords: ['chat', 'hajunai'],
      });

      return Response.json({ reply, observations, traceId });
    }

    return Response.json({ _error: '알 수 없는 action', traceId }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
  }
}