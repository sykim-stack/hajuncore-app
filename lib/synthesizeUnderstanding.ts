// lib/synthesizeUnderstanding.ts
// 계약: 원본=Message/Knowledge Unit, contexts=HajunAI 현재 이해 상태
// 본선: 관제·개발·브라이언풀 마당 메시지 + KU를 읽어 한 이해로 종합
import { supabaseGet, supabasePatch } from '@/lib/supabase';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY!;

/** 맥락 본선 마당 — 상품 마당은 별선이므로 여기 넣지 않음 */
const CORE_YARD_KEYS = ['gwanje', 'gaebal', 'brainpool'] as const;

export async function fetchUnderstanding(): Promise<string> {
  try {
    const data = await supabaseGet(
      'contexts?order=updated_at.desc&limit=1' +
      '&select=understanding,last_synthesized_at,knowledge_unit_ids'
    );
    if (!data || data.length === 0) return '';
    const row = data[0];
    const u = row.understanding;
    if (!u) return '';
    const text = typeof u === 'string' ? u : (u.text || u.summary || JSON.stringify(u));
    if (!text || !String(text).trim()) return '';
    const when = row.last_synthesized_at ? String(row.last_synthesized_at).slice(0, 16) : '';
    return when ? `${text}\n(종합 시점: ${when})` : String(text);
  } catch {
    return '';
  }
}

async function upsertUnderstanding(payload: {
  understanding: string;
  knowledge_unit_ids: string[];
}): Promise<{ id?: string; _error?: string }> {
  const now = new Date().toISOString();
  const body: Record<string, unknown> = {
    understanding: payload.understanding,
    knowledge_unit_ids: payload.knowledge_unit_ids,
    last_synthesized_at: now,
    updated_at: now,
  };
  try {
    const existing = await supabaseGet('contexts?order=updated_at.desc&limit=1&select=id');
    if (existing && existing[0]?.id) {
      const patched = await supabasePatch('contexts', existing[0].id, body);
      return { id: patched?.[0]?.id || existing[0].id };
    }
    const res = await fetch(`${SUPABASE_URL}/rest/v1/contexts`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { _error: `contexts 저장 실패: ${await res.text()}` };
    const saved = await res.json();
    return { id: saved?.[0]?.id };
  } catch (e) {
    return { _error: e instanceof Error ? e.message : String(e) };
  }
}

/** 관제·개발·브라이언풀 마당의 의미 있는 메시지 원본 */
async function fetchCoreYardMessages(): Promise<Array<Record<string, unknown>>> {
  try {
    const yards = await supabaseGet(
      `hajun_yards?key=in.(${CORE_YARD_KEYS.join(',')})&select=id,key,name`
    );
    if (!yards || yards.length === 0) return [];

    const yardById = new Map<string, { key: string; name: string }>();
    for (const y of yards as Array<{ id: string; key: string; name: string }>) {
      yardById.set(y.id, { key: y.key, name: y.name });
    }
    const yardIds = [...yardById.keys()];
    if (yardIds.length === 0) return [];

    const rooms = await supabaseGet(
      `hajun_rooms?yard_id=in.(${yardIds.join(',')})&select=id,key,name,yard_id`
    );
    if (!rooms || rooms.length === 0) return [];

    const roomById = new Map<string, { key: string; name: string; yard_id: string }>();
    for (const r of rooms as Array<{ id: string; key: string; name: string; yard_id: string }>) {
      roomById.set(r.id, { key: r.key, name: r.name, yard_id: r.yard_id });
    }
    const roomIds = [...roomById.keys()];
    if (roomIds.length === 0) return [];

    const messages = await supabaseGet(
      `hajun_messages?room_id=in.(${roomIds.join(',')})` +
        `&msg_type=in.(decision,understanding,issue,work_result,question,answer)` +
        `&order=created_at.desc&limit=40` +
        `&select=id,room_id,author_type,author_name,msg_type,content,created_at`
    );
    if (!messages || !Array.isArray(messages)) return [];

    return messages.map((m: Record<string, unknown>) => {
      const room = roomById.get(String(m.room_id));
      const yard = room ? yardById.get(room.yard_id) : undefined;
      return {
        ...m,
        _yard_key: yard?.key || '',
        _yard_name: yard?.name || '',
        _room_key: room?.key || '',
        _room_name: room?.name || '',
      };
    });
  } catch {
    return [];
  }
}

/** Knowledge Unit + 세 마당 원본을 읽어 contexts.understanding을 갱신한다. */
export async function synthesizeUnderstandingFromKnowledge(): Promise<{
  understanding?: string;
  knowledge_unit_ids?: string[];
  yard_message_ids?: string[];
  id?: string;
  _error?: string;
  skipped?: boolean;
  reason?: string;
}> {
  const [units, yardMsgs] = await Promise.all([
    supabaseGet(
      'hajunai_conversations?order=created_at.desc&limit=40' +
        '&select=id,summary,original_message,source_ai,source_core,knowledge_type,keywords,created_at'
    ),
    fetchCoreYardMessages(),
  ]);

  const hasKU = units && Array.isArray(units) && units.length > 0;
  const hasYard = yardMsgs.length > 0;
  if (!hasKU && !hasYard) {
    return { skipped: true, reason: 'Knowledge Unit / 세 마당 메시지 없음' };
  }

  const ranked = hasKU
    ? [...units].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
        const score = (x: Record<string, unknown>) => {
          const t = String(x.knowledge_type || 'raw');
          if (t === 'life' || t === 'language' || t === 'context' || t === 'pattern') return 2;
          if (x.summary) return 1;
          return 0;
        };
        return score(b) - score(a);
      })
    : [];
  const pickedKU = ranked.slice(0, 15);
  const kuIds = pickedKU.map((u: { id: string }) => u.id).filter(Boolean);

  const kuBlock = pickedKU
    .map((u: Record<string, unknown>) => {
      const date = String(u.created_at || '').slice(0, 10);
      const type = u.knowledge_type || 'raw';
      const core = u.source_core || u.source_ai || '';
      const summary = String(u.summary || u.original_message || '').slice(0, 160);
      return `- [${date}] KU(${type}/${core}) ${summary}`;
    })
    .join('\n');

  const yardScore = (m: Record<string, unknown>) => {
    const t = String(m.msg_type || '');
    if (t === 'decision') return 3;
    if (t === 'issue' || t === 'understanding') return 2;
    if (t === 'work_result') return 1;
    return 0;
  };
  const pickedYard = [...yardMsgs]
    .sort((a, b) => yardScore(b) - yardScore(a))
    .slice(0, 20);
  const yardIds = pickedYard.map((m) => String(m.id)).filter(Boolean);

  const yardBlock = pickedYard
    .map((m) => {
      const date = String(m.created_at || '').slice(0, 10);
      const yard = m._yard_name || m._yard_key || '마당';
      const room = m._room_name || m._room_key || '';
      const typ = m.msg_type || '';
      const who = m.author_name || m.author_type || '';
      const body = String(m.content || '').slice(0, 140);
      return `- [${date}] ${yard}/${room} (${typ}/${who}) ${body}`;
    })
    .join('\n');

  const sourceBlock = [
    kuBlock ? `=== Knowledge Units ===\n${kuBlock}` : '',
    yardBlock ? `=== 관제·개발·브라이언풀 마당 메시지 ===\n${yardBlock}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  if (!GEMINI_KEY) {
    const fallback =
      `최근 원본을 반영한 현재 이해 (KU ${pickedKU.length} · 마당메시지 ${pickedYard.length}).\n` +
      sourceBlock.slice(0, 1400);
    const up = await upsertUnderstanding({ understanding: fallback, knowledge_unit_ids: kuIds });
    if (up._error) return { _error: up._error };
    return {
      understanding: fallback,
      knowledge_unit_ids: kuIds,
      yard_message_ids: yardIds,
      id: up.id,
    };
  }

  const prompt = `당신은 HajunAI다. 아래는 Core들이 남긴 원본이다.\nKnowledge Unit과 관제·개발·브라이언풀 마당 메시지를 함께 보고,\n지금 이 사람/프로젝트에 대한 "현재 이해"를 한국어 평문 5~12문장으로 써라.\n규칙:\n- 원본에 없는 사실을 지어내지 말 것\n- 마크다운 금지\n- "이해:" 같은 헤더 없이 본문만\n- 개발 핸드오프 문체가 아니라, 세 마당을 가로지르는 흐름 이해 문체\n- 관제(운영·판정), 개발(구현 상태), 브라이언풀(본류·결정)이 보이면 연결해 서술\n\n${sourceBlock}`;

  const geminiRes = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
    }
  );
  if (!geminiRes.ok) {
    return { _error: `Gemini 오류: ${await geminiRes.text()}` };
  }
  const geminiData = await geminiRes.json();
  const parts = geminiData.candidates?.[0]?.content?.parts || [];
  const understanding = parts
    .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
    .map((p: { text: string }) => p.text)
    .join('')
    .trim();
  if (!understanding) return { _error: '이해 문장 생성 실패(빈 응답)' };

  const up = await upsertUnderstanding({ understanding, knowledge_unit_ids: kuIds });
  if (up._error) return { _error: up._error };
  return {
    understanding,
    knowledge_unit_ids: kuIds,
    yard_message_ids: yardIds,
    id: up.id,
  };
}
