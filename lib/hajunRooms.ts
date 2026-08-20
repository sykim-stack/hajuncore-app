// lib/hajunRooms.ts
// HajunAI 개발 공간 — CoreNull room+post 패턴 적용 (Owner: HajunAI)
// 원칙: Room=주제(모델 무관, 오래 유지), author_agent=슬롯 정체성(모델 아님),
//       model_used=실제 엔진(교체 가능), adopted=채택여부(보존여부와 무관, 전부 저장)

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const FALLBACK_ROOM_NAME = 'HajunAI 개발';

export type HajunPostInput = {
  room_id: string;
  author_agent: string;
  model_used?: string;
  content: string;
  adopted: boolean;
  question_ref: string;
};

/**
 * dev_contexts.phase를 이름으로 하는 Room을 찾거나 생성한다.
 * phase가 없으면 "HajunAI 개발"로 fallback.
 */
export async function resolveRoomId(phaseName: string | null): Promise<string | null> {
  const roomName = (phaseName && phaseName.trim()) || FALLBACK_ROOM_NAME;

  try {
    // 1. 기존 Room 조회
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/hajun_rooms?name=eq.${encodeURIComponent(roomName)}&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
    );
    if (getRes.ok) {
      const existing = await getRes.json();
      if (existing && existing.length > 0) return existing[0].id;
    }

    // 2. 없으면 생성
    const createRes = await fetch(`${SUPABASE_URL}/rest/v1/hajun_rooms`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ name: roomName }),
    });
    if (!createRes.ok) {
      // unique 제약 충돌(동시 요청으로 이미 생성됐을 수 있음) — 다시 조회 시도
      const retryRes = await fetch(
        `${SUPABASE_URL}/rest/v1/hajun_rooms?name=eq.${encodeURIComponent(roomName)}&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
      );
      if (retryRes.ok) {
        const retried = await retryRes.json();
        if (retried && retried.length > 0) return retried[0].id;
      }
      return null;
    }
    const created = await createRes.json();
    return created[0]?.id || null;
  } catch {
    return null;
  }
}

/**
 * 여러 post를 한 번에 저장한다. 실패해도 조용히 무시 (채팅 흐름을 막지 않음).
 */
export async function saveHajunPosts(posts: HajunPostInput[]): Promise<void> {
  if (posts.length === 0) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/hajun_posts`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(posts),
    });
  } catch {
    // 저장 실패해도 응답 흐름은 막지 않음
  }
}

/**
 * dev_contexts에서 현재 phase만 가볍게 조회 (Room 매칭용).
 */
export async function fetchCurrentPhase(): Promise<string | null> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/dev_contexts?order=updated_at.desc&limit=1&select=phase`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data?.[0]?.phase || null;
  } catch {
    return null;
  }
}