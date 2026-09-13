// lib/hajunApiCore.ts
import { supabaseGet, supabasePatch } from '@/lib/supabase';
import { fetchUnderstanding, synthesizeUnderstandingFromKnowledge } from '@/lib/synthesizeUnderstanding';

export const SUPABASE_URL = process.env.SUPABASE_URL!;
export const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
export const GEMINI_KEY  = process.env.GEMINI_API_KEY!;
export const GROQ_KEY    = process.env.GROQ_API_KEY!;
export const HOUSE_ID    = '6341b872-4555-4fdc-8f1d-8009b2b1764f';
export const COREHUB_URL = process.env.COREHUB_URL || 'https://brainpool-corehub.vercel.app';

export function createTraceId() {
  return 'tr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

export async function getYardByKey(key: string) {
  const data = await supabaseGet(`hajun_yards?key=eq.${encodeURIComponent(key)}&limit=1`);
  return data?.[0] || null;
}

export async function getRoomsByYardId(yardId: string) {
  return supabaseGet(`hajun_rooms?yard_id=eq.${yardId}&order=created_at.asc`);
}

export async function getRoomByKeys(yardKey: string, roomKey: string) {
  const yard = await getYardByKey(yardKey);
  if (!yard) return { _error: `\ub9c8\ub2f9\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4: ${yardKey}` };
  const rooms = await getRoomsByYardId(yard.id);
  const room = (rooms || []).find((item: { key?: string }) => item.key === roomKey);
  if (!room) return { _error: `\ubc29\uc744 \ucc3e\uc744 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4: ${yardKey}/${roomKey}` };
  return { yard, room };
}

export function isProductMetadata(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

export async function getProductMessages(internalCode?: string) {
  let path = 'hajun_messages?metadata->>entity_type=eq.product_candidate&order=created_at.desc';
  if (internalCode) path += `&metadata->>internal_code=eq.${encodeURIComponent(internalCode)}`;
  return supabaseGet(path);
}

export function groupProductCandidates(messages: Array<Record<string, unknown>>) {
  const grouped = new Map<string, Record<string, unknown>>();
  for (const message of messages) {
    const metadata = isProductMetadata(message.metadata) ? message.metadata : {};
    const code = typeof metadata.internal_code === 'string' ? metadata.internal_code : '';
    if (!code || grouped.has(code)) continue;
    grouped.set(code, { ...message, metadata });
  }
  return Array.from(grouped.values());
}

export async function insertHajunMessage(body: Record<string, unknown>) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hajun_messages`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { _error: `\uba54\uc2dc\uc9c0 \uc800\uc7a5 \uc2e4\ud328: ${await res.text()}` };
    return { data: await res.json() };
  } catch (e) {
    return { _error: e instanceof Error ? e.message : String(e) };
  }
}

export function buildSnapshotSummary(content: Record<string, unknown>): string {
  const house   = (content?.house   || {}) as Record<string, string>;
  const summary = (content?.summary || {}) as Record<string, number>;
  const rooms   = (content?.rooms   || []) as Array<Record<string, unknown>>;
  const parts: string[] = [];
  if (house.title) parts.push(`${house.title} (${house.primary_language || ''})`);
  if (summary.seed_rooms   > 0) parts.push(`\uc528\uc557\ubc29 ${summary.seed_rooms}\uac1c`);
  if (summary.bloomed_seeds > 0) parts.push(`\uaf43 ${summary.bloomed_seeds}\uac1c`);
  if (summary.total_fruits  > 0) parts.push(`\uc5f4\ub9e4 ${summary.total_fruits}\uac1c`);
  if (summary.total_harvested > 0) parts.push(`\uc218\ud655 ${summary.total_harvested}\uac1c`);
  parts.push(`\uba54\uc2dc\uc9c0 ${summary.total_messages || 0}\uac1c`);
  const seedRooms = rooms.filter(r => r.seed_mode);
  if (seedRooms.length > 0)
    parts.push(`\uc528\uc557: ${seedRooms.map(r => r.room_name).join(', ')}`);
  return parts.join(' \u00b7 ');
}

export function buildSnapshotKeywords(content: Record<string, unknown>): string[] {
  const house   = (content?.house   || {}) as Record<string, string>;
  const summary = (content?.summary || {}) as Record<string, number>;
  const rooms   = (content?.rooms   || []) as Array<Record<string, unknown>>;
  const kw: string[] = ['life', 'CoreNull'];
  if (house.primary_language) kw.push(`lang_${house.primary_language}`);
  if (summary.seed_rooms   > 0) kw.push('seed_active');
  if (summary.bloomed_seeds > 0) kw.push('bloomed');
  if (summary.total_fruits  > 0) kw.push('fruit');
  if (summary.total_harvested > 0) kw.push('harvested');
  if (rooms.some((r: Record<string, unknown>) => r.visibility === 'public'))  kw.push('public_space');
  if (rooms.some((r: Record<string, unknown>) => r.visibility === 'family'))  kw.push('family_space');
  if ((summary.total_messages || 0) > 10) kw.push('high_activity');
  else if ((summary.total_messages || 0) > 0) kw.push('low_activity');
  else kw.push('inactive');
  return kw;
}

export function calcSnapshotConfidence(snapshot: Record<string, unknown>): number {
  const summary = ((snapshot.content as Record<string, unknown>)?.summary || {}) as Record<string, number>;
  const ids = (snapshot.source_message_ids as string[]) || [];
  let conf = 0.55;
  if ((summary.total_messages || 0) > 5) conf += 0.10;
  if ((summary.seed_rooms     || 0) > 0) conf += 0.05;
  if ((summary.total_fruits   || 0) > 0) conf += 0.05;
  if (ids.length > 1)                    conf += 0.05;
  return Math.min(conf, 0.90);
}

export async function fetchMindWorldSummary(): Promise<string> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/corenull_rooms?house_id=eq.${HOUSE_ID}&order=updated_at.desc&limit=5`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
    );
    if (!res.ok) return '\uc528\uc557 \ub370\uc774\ud130 \uc5c6\uc74c';
    const rooms = await res.json();
    if (!rooms || rooms.length === 0) return '\uc528\uc557 \ub370\uc774\ud130 \uc5c6\uc74c';
    return rooms
      .map((r: { name?: string; fruit_state?: string; updated_at?: string }) =>
        `- ${r.name || '\uc774\ub984\uc5c6\uc74c'} (${r.fruit_state || 'unknown'}) | ${r.updated_at?.slice(0, 10) || ''}`
      )
      .join('\n');
  } catch {
    return '\uc528\uc557 \ub370\uc774\ud130 \uc870\ud68c \uc2e4\ud328';
  }
}

export async function fetchOpportunities(ownerKey: string): Promise<{ text: string; ids: string[] }> {
  if (!ownerKey) return { text: '', ids: [] };
  try {
    const res = await fetch(
      `${COREHUB_URL}/api/corehub/opportunities?owner_key=${encodeURIComponent(ownerKey)}`,
      { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' }
    );
    if (!res.ok) return { text: '', ids: [] };
    const json = await res.json();
    const items = json.data || [];
    if (items.length === 0) return { text: '', ids: [] };
    const top = items.slice(0, 3);
    const ids = top.map((o: { id: string }) => o.id);
    const text = top
      .map((o: { title?: string; description?: string; opportunity_type?: string }) =>
        `- ${o.title || o.description || '\ubc1c\uacac\ub41c \uae30\ud68c'} (${o.opportunity_type || 'opportunity'})`
      )
      .join('\n');
    return { text, ids };
  } catch {
    return { text: '', ids: [] };
  }
}

export async function consumeOpportunities(ids: string[], outcome = 'shown'): Promise<void> {
  if (!ids.length) return;
  try {
    await Promise.all(ids.map(id =>
      fetch(`${COREHUB_URL}/api/corehub/opportunities?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
    ));
  } catch { /* ignore */ }
}

export async function fetchContextSummary(): Promise<string> {
  try {
    const data = await supabaseGet('dev_contexts?order=updated_at.desc&limit=1');
    if (!data || data.length === 0) return '\uac1c\ubc1c \ub9e5\ub77d \uc5c6\uc74c';
    const c = data[0];
    const parts: string[] = [];
    if (c.phase)          parts.push(`\ud398\uc774\uc988: ${c.phase}`);
    if (c.status)         parts.push(`\uc0c1\ud0dc: ${c.status}`);
    if (c.last_task)      parts.push(`\ub9c8\uc9c0\ub9c9 \uc791\uc5c5: ${c.last_task}`);
    if (c.next_action)    parts.push(`\ub2e4\uc74c \uc561\uc158: ${c.next_action}`);
    if (c.current_problems && c.current_problems !== '\uc5c6\uc74c')
                          parts.push(`\ud604\uc7ac \ubb38\uc81c: ${c.current_problems}`);
    if (c.summary)        parts.push(`\uc694\uc57d: ${c.summary}`);
    if (Array.isArray(c.next_tasks) && c.next_tasks.length > 0)
      parts.push(`\ub2e4\uc74c \uc791\uc5c5:\n${c.next_tasks.map((t: string) => `  - ${t}`).join('\n')}`);
    return parts.join('\n') || '\ub9e5\ub77d \ub370\uc774\ud130 \ud30c\uc2f1 \uc2e4\ud328';
  } catch {
    return '\uac1c\ubc1c \ub9e5\ub77d \uc870\ud68c \uc2e4\ud328';
  }
}

export async function saveConversation(payload: {
  source_ai: string;
  original_message: string;
  summary: string;
  keywords: string[];
  meta?: Record<string, unknown>;
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
  } catch { /* ignore */ }
}

export async function callGroq(
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
    return { _error: `Groq API \uc624\ub958: ${errText}` };
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { text };
}

export function parseReply(raw: string): { reply: string; observations: string[] } {
  const obsMarkers = ['\uad00\ucc30:', '\uad00\ucc30 :', 'Observations:', '\uad00\ucc30\uc0ac\ud56d:'];
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

export { fetchUnderstanding, synthesizeUnderstandingFromKnowledge } from '@/lib/synthesizeUnderstanding';
export { supabaseGet, supabasePatch } from '@/lib/supabase';
