// lib/hajunRooms.ts
// HajunAI 공간·메시지 아키텍처 v1.0 — 개발마당 5개 엔진방(고정)
// 방=엔진 책임 영역(CoreNull/CoreChat/CoreRing/CoreHub/Hajun), 프로젝트는 Context 축(project_ref)일 뿐 방 정체성 아님.
// 관제마당은 범위 밖 (의미 View는 사람 승인 필요, 아직 없음).
//
// v1.1: Room Context Package 4단계 (buildRoomContextPackage)
//
// v1.2: adopted ≠ decision 원칙 확정 (2026-08-23)
// - adopted = 이번 AI 라운드에서 심사 AI가 선택한 답. 사람 검증 아님. 헐루시네이션 가능.
// - confirmed_by_human = 사람이 검토하고 프로젝트 결정으로 확정한 것만 true.
// - prior_adopted_answers: adopted 기반, "AI가 과거에 뽑았던 답" 참고용 기록일 뿐.
// - prior_decisions: confirmed_by_human 기반. 아직 확정 UI/API가 없으므로 대부분 빈 배열이 정상이다.
//   adopted를 prior_decisions로 자동 승격하지 않는다 — 이걸 하면 AI 라운드 승자가
//   검증 없이 다음 AI들의 "프로젝트 역사"로 주입되는 오염 루프가 생긴다.

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
  // v1.2: 저장 시점에는 항상 비워둔다. 사람이 별도 확정 절차를 거쳐야만 채워진다.
  confirmed_by_human?: boolean;
};

type HajunPostRow = HajunPostInput & {
  id?: string;
  created_at?: string;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
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

/**
 * AI 응답들을 원본으로 저장한다. adopted는 그대로 저장하되,
 * confirmed_by_human은 절대 여기서 채우지 않는다 (기본값 false 유지).
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
      // confirmed_by_human을 명시적으로 포함하지 않는다 — DB 기본값(false)에 맡긴다.
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

// ── Room Context Package (4단계) ──────────────────────────────

export const ROOM_PURPOSE: Record<EngineRoom, string> = {
  CoreNull: '사람 공간·House·Room·Post·View·관계',
  CoreChat: '대화 흐름·세션·참여 관계',
  CoreRing: '번역·언어·해석·문화 맥락',
  CoreHub: 'Core 간 상태·취합·연결·기회',
  Hajun: 'HajunAI 공간·AI 활동·기억·전체 맥락',
};

export type RoomContextMessage = {
  author_agent: string;
  model_used?: string;
  content: string;
  adopted: boolean;
  confirmed_by_human: boolean;
  question_ref: string;
  created_at?: string;
};

export type RoomContextParticipant = {
  author_agent: string;
  model_used?: string;
  message_count: number;
};

export type RoomContextPackage = {
  room: {
    type: EngineRoom;
    room_id: string;
    name: EngineRoom;
    purpose: string;
  };
  context: {
    project_ref: string | null;
    recent_messages: RoomContextMessage[];
    // v1.2: AI 라운드 승자 기록. "결정"이 아니라 "참고용 과거 채택 답변"이다.
    prior_adopted_answers: string[];
    // v1.2: 사람이 실제로 확정한 프로젝트 결정. 확정 절차가 없으면 비어있는 게 정상.
    prior_decisions: string[];
  };
  participants: RoomContextParticipant[];
};

export type RoomContextResult = RoomContextPackage | { _error: string };

/**
 * 5개 고정 엔진방 중 하나의 hajun_posts를 원본으로 읽어 Context Package(View)를 만든다.
 * - hajun_posts를 재저장하지 않는다. 순수 조회 + 가공만 한다.
 * - recent_messages: 최신 limit개를 시간순(오래된 것 먼저)으로 정렬해 반환한다.
 * - prior_adopted_answers: adopted=true였던 응답들 — AI 라운드 승자 기록일 뿐, 검증된 사실 아님.
 * - prior_decisions: confirmed_by_human=true인 것만 — 사람이 실제로 확정한 프로젝트 결정.
 *   adopted를 여기로 자동 승격하지 않는다 (오염 루프 방지).
 * - participants: author_agent/model_used 조합별 발언 횟수 집계.
 */
export async function buildRoomContextPackage(
  room: EngineRoom,
  opts?: { limit?: number }
): Promise<RoomContextResult> {
  const limit = opts?.limit ?? 20;

  const roomId = await getEngineRoomId(room);
  if (!roomId) return { _error: `엔진방 조회 실패: ${room} (hajun_rooms에 해당 name 없음)` };

  const projectRef = await fetchCurrentPhase();

  let posts: HajunPostRow[];
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/hajun_posts?room_id=eq.${roomId}&order=created_at.desc&limit=${limit}`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
    );
    if (!res.ok) {
      const err = await res.text();
      return { _error: `hajun_posts 조회 실패: ${err}` };
    }
    posts = await res.json();
  } catch (e) {
    return { _error: e instanceof Error ? e.message : String(e) };
  }

  // 시간순(오래된 것 → 최신) 정렬 — AI가 읽을 때 흐름이 자연스럽도록
  const chronological = [...posts].reverse();

  const recent_messages: RoomContextMessage[] = chronological.map((p) => ({
    author_agent: p.author_agent,
    model_used: p.model_used,
    content: p.content,
    adopted: p.adopted,
    confirmed_by_human: p.confirmed_by_human === true,
    question_ref: p.question_ref,
    created_at: p.created_at,
  }));

  // AI 라운드 승자 기록 — 참고용. "결정"이라 부르지 않는다.
  const prior_adopted_answers = chronological
    .filter((p) => p.adopted)
    .map((p) => p.content)
    .slice(-5);

  // 사람이 실제로 확정한 것만. confirmed_by_human을 채우는 API가 아직 없으므로
  // 지금은 대부분 빈 배열이 정상 — 이게 오염을 막고 있다는 증거다.
  const prior_decisions = chronological
    .filter((p) => p.confirmed_by_human === true)
    .map((p) => p.content)
    .slice(-5);

  const participantMap = new Map<string, RoomContextParticipant>();
  for (const p of posts) {
    const key = `${p.author_agent}::${p.model_used || ''}`;
    const existing = participantMap.get(key);
    if (existing) {
      existing.message_count += 1;
    } else {
      participantMap.set(key, {
        author_agent: p.author_agent,
        model_used: p.model_used,
        message_count: 1,
      });
    }
  }

  return {
    room: {
      type: room,
      room_id: roomId,
      name: room,
      purpose: ROOM_PURPOSE[room],
    },
    context: {
      project_ref: projectRef,
      recent_messages,
      prior_adopted_answers,
      prior_decisions,
    },
    participants: Array.from(participantMap.values()),
  };
}