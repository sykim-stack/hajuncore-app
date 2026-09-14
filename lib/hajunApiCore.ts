// lib/hajunApiCore.ts
import { supabaseGet, supabasePatch } from '@/lib/supabase';
import { fetchUnderstanding, synthesizeUnderstandingFromKnowledge } from '@/lib/synthesizeUnderstanding';

export const SUPABASE_URL = process.env.SUPABASE_URL!;
export const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
export const GEMINI_KEY  = process.env.GEMINI_API_KEY!;
export const GROQ_KEY    = process.env.GROQ_API_KEY!;
/** 선택. 비어 있으면 Groq 후보 목록 시도 */
export const GROQ_MODEL  = process.env.GROQ_MODEL || '';
/** 관제·개발 마당과 동일 계열 — NVIDIA NIM (OpenAI 호환) */
export const NVIDIA_KEY   = process.env.NVIDIA_API_KEY || process.env.NIM_API_KEY || '';
export const NVIDIA_MODEL = process.env.NVIDIA_MODEL || 'meta/llama-3.1-8b-instruct';
export const NVIDIA_BASE  = process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1';
export const HOUSE_ID    = '6341b872-4555-4fdc-8f1d-8009b2b1764f';
export const COREHUB_URL = process.env.COREHUB_URL || 'https://brainpool-corehub.vercel.app';

const GROQ_MODEL_CANDIDATES = [
  GROQ_MODEL,
  'llama-3.3-70b-versatile',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'llama-3.1-8b-instant',
].filter(Boolean);

/** 방/상품 추천 등 단일 프롬프트용 — 후보 모델 순차 시도 */
export async function callGroqPrompt(
  prompt: string,
  opts?: { temperature?: number; max_tokens?: number }
): Promise<{ text?: string; model?: string; _error?: string }> {
  if (!GROQ_KEY) return { _error: 'GROQ_API_KEY 미설정' };
  const errors: string[] = [];
  const tried = new Set<string>();
  for (const model of GROQ_MODEL_CANDIDATES) {
    if (tried.has(model)) continue;
    tried.add(model);
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts?.temperature ?? 0.4,
        max_tokens: opts?.max_tokens ?? 700,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      errors.push(`${model}: ${errText.slice(0, 200)}`);
      // model_not_found 등은 다음 후보 시도
      continue;
    }
    const data = await res.json();
    const text = (data.choices?.[0]?.message?.content || '').trim();
    if (text) return { text, model };
    errors.push(`${model}: empty`);
  }
  return { _error: `Groq 후보 전부 실패: ${errors.slice(0, 3).join(' | ')}` };
}

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
  if (!yard) return { _error: `마당을 찾을 수 없습니다: ${yardKey}` };
  const rooms = await getRoomsByYardId(yard.id);
  const room = (rooms || []).find((item: { key?: string }) => item.key === roomKey);
  if (!room) return { _error: `방을 찾을 수 없습니다: ${yardKey}/${roomKey}` };
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
    if (!res.ok) return { _error: `메시지 저장 실패: ${await res.text()}` };
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
  if (summary.seed_rooms   > 0) parts.push(`씨앗방 ${summary.seed_rooms}개`);
  if (summary.bloomed_seeds > 0) parts.push(`꽃 ${summary.bloomed_seeds}개`);
  if (summary.total_fruits  > 0) parts.push(`열매 ${summary.total_fruits}개`);
  if (summary.total_harvested > 0) parts.push(`수확 ${summary.total_harvested}개`);
  parts.push(`메시지 ${summary.total_messages || 0}개`);
  const seedRooms = rooms.filter(r => r.seed_mode);
  if (seedRooms.length > 0)
    parts.push(`씨앗: ${seedRooms.map(r => r.room_name).join(', ')}`);
  return parts.join(' · ');
}
