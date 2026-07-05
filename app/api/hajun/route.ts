// app/api/hajun/route.ts
// BRAINPOOL 계약: throw 금지, _error 필드 사용, 200/500만
// action: contexts | dev_contexts | snapshots | update_context | chat | summarize_context
// 채팅: Groq (llama-3.3-70b-versatile) / 요약: Gemini 2.5 Flash
//
// v1.1 변경사항:
// - GET  contexts      → 사람 이해용 contexts (understanding 등 새 구조)
// - GET  dev_contexts  → 개발 핸드오프 (구 contexts 역할, 신규)
// - POST update_context → dev_contexts 패치로 라우팅 (하위 호환 유지)
// - fetchContextSummary() → dev_contexts 읽도록 변경

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

// ── dev_contexts 최신 1건 (chat 시스템 프롬프트용) ───────────
// v1.1: contexts → dev_contexts (개발 핸드오프 전용 테이블)
async function fetchContextSummary(): Promise<string> {
  try {
    const data = await supabaseGet('dev_contexts?order=updated_at.desc&limit=1');
    if (!data || data.length === 0) return '개발 맥락 없음';
    const c = data[0];
    const parts: string[] = [];
    if (c.phase)          parts.push(`페이즈: ${c.phase}`);
    if (c.status)         parts.push(`상태: ${c.status}`);
    if (c.last_task)      parts.push(`마지막 작업: ${c.last_task}`);
    if (c.next_action)    parts.push(`다음 액션: ${c.next_action}`);
    if (c.current_problems && c.current_problems !== '없음')
                          parts.push(`현재 문제: ${c.current_problems}`);
    if (c.summary)        parts.push(`요약: ${c.summary}`);
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
    // 사람 이해용 contexts (v1.1 재정의 — understanding, confidence_map 등)
    if (action === 'contexts') {
      const data = await supabaseGet(
        'contexts?order=updated_at.desc&limit=1' +
        '&select=id,person_id,device_id,understanding,confidence_map,' +
        'knowledge_unit_ids,evolution,last_synthesized_at,updated_at'
      );
      return Response.json({ payload: data[0] || null });
    }

    // 개발 핸드오프 — dev_contexts (구 contexts 역할, v1.1 신규)
    if (action === 'dev_contexts') {
      const data = await supabaseGet('dev_contexts?order=updated_at.desc&limit=1');
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

    // ── update_context → dev_contexts 패치 (하위 호환 유지) ───
    // v1.1: Dashboard / Chrome Extension이 기존 action명 그대로 써도 동작
    if (action === 'update_context') {
      const { id, ...fields } = body;
      if (!id) return Response.json({ _error: 'id 필요', traceId }, { status: 200 });
      const data = await supabasePatch('dev_contexts', id, {
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
        fetchContextSummary(),   // dev_contexts 읽음 (v1.1)
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
    // v1.2: 마크다운 제거 + 전처리 + 필드별 한 줄 강제
    if (action === 'summarize_context') {
      if (!GEMINI_KEY) {
        return Response.json({ _error: 'GEMINI_API_KEY 환경변수 미설정', traceId }, { status: 200 });
      }

      // ── 텍스트 정제 헬퍼 ──────────────────────────────────
      function cleanText(text: string, maxLen = 200): string {
        return (text || '')
          .replace(/\*\*(.+?)\*\*/g, '$1')   // **bold** 제거
          .replace(/#{1,6}\s/g, '')           // # 헤더 제거
          .replace(/[\u0060]{1,3}[^\u0060\n]*[\u0060]{1,3}/g, '') // 코드블록 제거
          .replace(/\n{3,}/g, '\n\n')         // 연속 줄바꿈 압축
          .replace(/[\u0000-\u001F]/g, ' ')   // 제어문자 제거
          .trim()
          .slice(0, maxLen);
      }

      // ── 1. dev_contexts 현재 상태 ─────────────────────────
      let devContextBlock = '개발 맥락 없음';
      try {
        const devData = await supabaseGet('dev_contexts?order=updated_at.desc&limit=1');
        if (devData && devData.length > 0) {
          const d = devData[0];
          const lines: string[] = [];
          if (d.phase)        lines.push(`페이즈: ${d.phase}`);
          if (d.status)       lines.push(`상태: ${d.status}`);
          if (d.last_task)    lines.push(`마지막 작업: ${cleanText(d.last_task, 100)}`);
          if (d.next_action)  lines.push(`다음 액션: ${cleanText(d.next_action, 100)}`);
          if (d.current_problems && d.current_problems !== '없음')
                              lines.push(`현재 문제: ${cleanText(d.current_problems, 100)}`);
          if (d.summary)      lines.push(`기존 요약: ${cleanText(d.summary, 150)}`);
          if (Array.isArray(d.completed_tasks) && d.completed_tasks.length > 0)
            lines.push(`완료: ${d.completed_tasks.slice(0, 5).map((t: string) => cleanText(t, 60)).join(' / ')}`);
          if (Array.isArray(d.next_tasks) && d.next_tasks.length > 0)
            lines.push(`예정: ${d.next_tasks.slice(0, 5).map((t: string) => cleanText(t, 60)).join(' / ')}`);
          devContextBlock = lines.join('\n');
        }
      } catch { devContextBlock = '개발 맥락 조회 실패'; }

      // ── 2. 최근 대화 (최근 30건, knowledge_type 분류) ─────
      let conversationBlock = '대화 없음';
      try {
        const convData = await supabaseGet(
          'hajunai_conversations?order=created_at.desc&limit=30' +
          '&select=original_message,source_ai,source_core,knowledge_type,summary,keywords,created_at'
        );
        if (!convData || convData.length === 0) {
          return Response.json({ _error: '저장된 대화가 없습니다', traceId }, { status: 200 });
        }

        const byType: Record<string, typeof convData> = {};
        for (const c of convData) {
          const t = c.knowledge_type || 'raw';
          if (!byType[t]) byType[t] = [];
          byType[t].push(c);
        }

        const sections: string[] = [];

        // raw 대화 — 정제 후 한 줄씩
        if (byType['raw'] && byType['raw'].length > 0) {
          sections.push('[최근 대화]');
          const lines = byType['raw']
            .slice(0, 15)
            .reverse()
            .map((c: { created_at?: string; source_ai?: string; original_message?: string; summary?: string }) => {
              const date    = c.created_at?.slice(0, 10) || '';
              const content = cleanText(c.summary || c.original_message || '', 120);
              return `${date} | ${content}`;
            });
          sections.push(lines.join('\n'));
        }

        // Knowledge Units — summary만 추출
        for (const type of ['language', 'context', 'life', 'pattern'] as const) {
          if (byType[type] && byType[type].length > 0) {
            const label: Record<string, string> = {
              language: '언어 이해', context: '대화 맥락',
              life: '생활 패턴', pattern: '발견된 패턴'
            };
            sections.push(`[Knowledge - ${label[type]}]`);
            sections.push(
              byType[type]
                .map((c: { summary?: string; keywords?: string[] }) =>
                  `• ${cleanText(c.summary || '', 100)}`
                )
                .join('\n')
            );
          }
        }

        conversationBlock = sections.join('\n');
      } catch {
        return Response.json({ _error: '대화 데이터 조회 실패', traceId }, { status: 200 });
      }

      // ── 3. MindWorld 현황 ──────────────────────────────────
      const mindWorldSummary = await fetchMindWorldSummary();

      // ── 4. Gemini 구조화 프롬프트 ─────────────────────────
      const summarizePrompt = `You are a JSON-only output machine.
CRITICAL: Output ONLY a single valid JSON object. No markdown. No code fences. No explanation. No newlines inside string values.

Output exactly this JSON structure with all 8 fields:
{"last_task":"...","summary":"...","next_action":"...","current_problems":"...","development_summary":"...","conversation_summary":"...","decisions":"...","risks":"..."}

STRICT RULES:
1. Every value must be a single line string (NO newlines, NO line breaks inside values)
2. Use comma(,) as separator between points, NOT newlines
3. Korean only
4. last_task: 최근 핵심 작업 (80자 이내)
5. summary: 프로젝트 현재 상태 (200자 이내)
6. next_action: 지금 당장 할 것 (예: "구현: CoreHub API - /api/corehub")
7. current_problems: 현재 블로커 (없으면 정확히 "없음")
8. development_summary: 개발 진행 상황 (완료+진행, 200자 이내)
9. conversation_summary: 최근 논의 핵심 (150자 이내)
10. decisions: 확정된 설계 결정 (없으면 정확히 "없음")
11. risks: 주의사항 (없으면 정확히 "없음")

=== 개발 현황 (dev_contexts) ===
${devContextBlock}

=== 최근 대화 및 Knowledge ===
${conversationBlock}

=== MindWorld 씨앗 상태 ===
${mindWorldSummary}`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: summarizePrompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 4096,
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
      const parts = geminiData.candidates?.[0]?.content?.parts || [];
      const rawText = parts
        .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
        .map((p: { text: string }) => p.text)
        .join('');

      // ── 파싱 4단계 방어 ───────────────────────────────────
      const FIELDS = ['last_task','summary','next_action','current_problems',
                      'development_summary','conversation_summary','decisions','risks'];

      let parsed: Record<string, string> = {};
      let parseOk = false;

      // 1단계: 직접 파싱
      try {
        const cleaned = rawText
          .replace(/[\u0000-\u001F&&[^\r\n\t]]/g, ' ')
          .replace(/,\s*([\]}])/g, '$1');
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objMatch) {
          parsed = JSON.parse(objMatch[0]);
          parseOk = FIELDS.some(f => parsed[f]);
        }
      } catch { /* 2단계로 */ }

      // 2단계: 줄바꿈 → 공백 치환 후 파싱
      if (!parseOk) {
        try {
          const inlined = rawText
            .replace(/("(?:[^"\\]|\\.)*")/g, (m) =>
              m.replace(/\n/g, ' ').replace(/\r/g, '')
            )
            .replace(/,\s*([\]}])/g, '$1');
          const objMatch = inlined.match(/\{[\s\S]*\}/);
          if (objMatch) {
            parsed = JSON.parse(objMatch[0]);
            parseOk = FIELDS.some(f => parsed[f]);
          }
        } catch { /* 3단계로 */ }
      }

      // 3단계: 필드별 정규식 추출
      if (!parseOk) {
        const extract = (key: string) => {
          const m = rawText.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
          return m ? m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim() : '';
        };
        for (const f of FIELDS) parsed[f] = extract(f);
        parseOk = FIELDS.some(f => parsed[f]);
      }

      // 4단계: 전부 실패
      if (!parseOk) {
        return Response.json({
          _error: 'Gemini 응답 파싱 실패',
          raw: rawText.slice(0, 500),
          traceId
        }, { status: 200 });
      }

      // 기본값 채우기
      for (const f of ['current_problems','decisions','risks']) {
        if (!parsed[f]) parsed[f] = '없음';
      }

      return Response.json({
        summary: {
          last_task:            parsed.last_task            || '',
          summary:              parsed.summary              || '',
          next_action:          parsed.next_action          || '',
          current_problems:     parsed.current_problems     || '없음',
          development_summary:  parsed.development_summary  || '',
          conversation_summary: parsed.conversation_summary || '',
          decisions:            parsed.decisions            || '없음',
          risks:                parsed.risks                || '없음',
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