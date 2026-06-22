// lib/supabase.ts
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.warn('[supabase] 환경변수 미설정: SUPABASE_URL, SUPABASE_SERVICE_KEY');
}

export async function supabaseGet(path: string, schema: string = 'public') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Accept-Profile': schema,
    },
    cache: 'no-store',
  });
  const text = await res.text();
  console.log('[supabaseGet]', path.substring(0, 50), res.status, text.substring(0, 200));
  if (!res.ok) return [];
  try { return JSON.parse(text); } catch(e) { return []; }
}

export async function supabasePatch(table: string, id: string, body: Record<string, unknown>, schema: string = 'public') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Content-Profile': schema,
      'Accept-Profile': schema,
      Prefer: 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase PATCH 실패 (${res.status}): ${text}`);
  }
  return res.json();
}