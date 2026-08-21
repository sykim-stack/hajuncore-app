// lib/hajunRooms.ts
// HajunAI 공간·메시지 아키텍처 v1.0 — 개발마당 5개 엔진방(고정)
// 방=엔진 책임 영역(CoreNull/CoreChat/CoreRing/CoreHub/Hajun), 프로젝트는 Context 축(project_ref)일 뿐 방 정체성 아님.
// 관제마당은 범위 밖 (의미 View는 사람 승인 필요, 아직 없음).

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;

export type EngineRoom = 'CoreNull' | 'CoreChat' | 'CoreRing' | 'CoreHub' | 'Hajun';

export type HajunPostInput = {
  room_id: string;
  project_ref?: string | null;
  author_agent: string;
  model_used?: string;
  content: string;
  adopted: boolean;
  question_ref: string;
};

const roomIdCache = new Map<EngineRoom, string>();

/**
 * 엔진방 이름으로 room_id를 가져온다. 5개 고정 방이라 캐싱해서 매번 조회하지 않는다.
 */
export async function getEngineRoomId(room: EngineRoom): Promise<string | null> {
  if (roomIdCache.has(room)) return roomIdCache.get(room)!;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/hajun_rooms?name=eq.${encodeURIComponent(room)}&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const id = data?.[0]?.id;
    if (id) roomIdCache.set(room, id);
    return id || null;
  } catch {
    return null;
  }
}

/**
 * 질문 내용을 보고 5개 엔진방 중 하나로 분류한다.
 * 키워드 매칭 우선, 애매하면 'Hajun'(기본값)으로.
 */
export function classifyEngineRoom(question: string): EngineRoom {
  const q = question.toLowerCase();
  if (/corenull|코어널|씨앗|seed|하우스|house|마당|거실|서재/.test(q)) return 'CoreNull';
  if (/corechat|코어챗|대화\s*흐름|세션|상호작용/.test(q)) return 'CoreChat';
  if (/corering|코어링|번역|language_knowledge|tp_lexicon|dialect|stt|발음/.test(q)) return 'CoreRing';
  if (/corehub|코어헙|취합|연결|opportunity|score|점수/.test(q)) return 'CoreHub';
  return 'Hajun'; // 기본값: 이해·기억·Context·관제 보조
}

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
    // 저장 실패해도 채팅 흐름은 유지
  }
}

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