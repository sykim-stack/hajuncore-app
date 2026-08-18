// lib/context.ts
// 공용 맥락 조회 함수 — 관제 Chat과 개발 Chat이 공유한다.
import { supabaseGet } from '@/lib/supabase';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const HOUSE_ID = '6341b872-4555-4fdc-8f1d-8009b2b1764f';

export async function fetchContextSummary(): Promise<string> {
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

export async function fetchMindWorldSummary(): Promise<string> {
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