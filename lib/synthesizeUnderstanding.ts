// lib/synthesizeUnderstanding.ts
// 계약: 원본=Message/Knowledge Unit, contexts=HajunAI 현재 이해 상태
import { supabaseGet, supabasePatch } from '@/lib/supabase';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GEMINI_KEY = process.env.GEMINI_API_KEY!;

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

/** Knowledge Unit 원본을 읽어 contexts.understanding을 갱신한다. */
export async function synthesizeUnderstandingFromKnowledge(): Promise<{
  understanding?: string;
  knowledge_unit_ids?: string[];
  id?: string;
  _error?: string;
  skipped?: boolean;
  reason?: string;
}> {
  const units = await supabaseGet(
    'hajunai_conversations?order=created_at.desc&limit=40' +
    '&select=id,summary,original_message,source_ai,source_core,knowledge_type,keywords,created_at'
  );
  if (!units || units.length === 0) {
    return { skipped: true, reason: 'Knowledge Unit 없음' };
  }
  const ranked = [...units].sort((a: Record<string, unknown>, b: Record<string, unknown>) => {
    const score = (x: Record<string, unknown>) => {
      const t = String(x.knowledge_type || 'raw');
      if (t === 'life' || t === 'language' || t === 'context' || t === 'pattern') return 2;
      if (x.summary) return 1;
      return 0;
    };
    return score(b) - score(a);
  });
  const picked = ranked.slice(0, 20);
  const ids = picked.map((u: { id: string }) => u.id).filter(Boolean);
  const block = picked.map((u: Record<string, unknown>) => {
    const date = String(u.created_at || '').slice(0, 10);
    const type = u.knowledge_type || 'raw';
    const core = u.source_core || u.source_ai || '';
    const summary = String(u.summary || u.original_message || '').slice(0, 180);
    return `- [${date}] (${type}/${core}) ${summary}`;
  }).join('\n');

  if (!GEMINI_KEY) {
    const fallback = `최근 Knowledge Unit ${picked.length}건을 반영한 현재 이해.\n${block.slice(0, 1200)}`;
    const up = await upsertUnderstanding({ understanding: fallback, knowledge_unit_ids: ids });
    if (up._error) return { _error: up._error };
    return { understanding: fallback, knowledge_unit_ids: ids, id: up.id };
  }

  const prompt = `당신은 HajunAI다. 아래는 Core들이 남긴 원본 Knowledge Unit이다.
이 원본만 근거로, 지금 이 사람/프로젝트에 대한 "현재 이해"를 한국어 평문 5~12문장으로 써라.
규칙:
- 원본에 없는 사실을 지어내지 말 것
- 마크다운 금지
- "이해:" 같은 헤더 없이 본문만
- 개발 핸드오프(dev_contexts) 문체가 아니라, 사람·프로젝트 흐름 이해 문체

=== 원본 Knowledge Units ===
${block}`;

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

  const up = await upsertUnderstanding({ understanding, knowledge_unit_ids: ids });
  if (up._error) return { _error: up._error };
  return { understanding, knowledge_unit_ids: ids, id: up.id };
}
