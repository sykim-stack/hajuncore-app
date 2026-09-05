// app/api/hajun/route.ts
// 하준아이(AI CoreNull) — 마당·거실·방 구조 API
//
// BRAINPOOL 계약: throw 금지, _error 필드 사용, req.text()+JSON.parse(),
// HTTP 200/500만, traceId 항상 포함.
//
// 확정 원칙:
//   - 메시지 원본은 오직 방(room)에만 존재한다.
//   - 마당(yard)/거실(livingroom)/방(room)은 전부 hajun_messages를
//     범위·개수만 다르게 잘라보는 View다. 새 테이블이 아니다.
//   - hajun_messages는 append-only. UPDATE 없음.
//   - 방은 고정, 참여자(author)는 유동. HajunAI는 특정 모델에 고정되지 않는다.
//   - ref_ids는 이 메시지가 딛고 선 이전 메시지들 (성장의 계보).
//     human/ai 둘 다 채울 수 있고, 다른 방의 메시지도 참조 가능.
//   - 두뇌 AI(현재 Groq llama-3.3-70b)는 방을 스스로 읽어서 맥락을 복구한다.
//     별도 context_package 주입 없음. 트리거는 사람의 명시적 요청뿐.
//     모델이 바뀌어도 이 action의 나머지 구조는 그대로 재사용된다.
//
// action 목록 (Vercel Hobby 12-route 한도 유지를 위해 단일 라우트 유지):
//   GET  yard_list                         → 마당 목록
//   GET  room_list      &yard=<key>        → 마당 산하 방 목록
//   GET  view_room       &room_id=<uuid>   → 방 뷰 (전체 이력, 깊게)
//   GET  view_livingroom &yard=<key>&limit=<n> → 거실 뷰 (방별 최신 N개)
//   GET  view_yard       &yard=<key>       → 마당 뷰 (방별 최신 1개)
//   POST post_message                       → 메시지 작성 (참여자가 방에 포스팅)
//   POST room_create                        → 새 방 생성 (마당 산하)
//   POST ai_respond                         → 두뇌 AI가 방을 읽고 답변 남김

import { supabaseGet } from '@/lib/supabase';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GROQ_KEY      = process.env.GROQ_API_KEY!;

// 현재 방에 입주해 있는 두뇌 AI. 언제든 교체 가능 — 교체 시 이 두 상수와
// callBrainAI() 내부 호출부만 바꾸면 되고, 나머지 흐름은 그대로 유지된다.
//
// [입주자 교체 기록]
// llama-3.3-70b-versatile → Groq가 2026-08-16부로 폐지 (2026-06-17 공지).
// 공식 권장 대체 모델인 openai/gpt-oss-120b로 교체 (2026-08-31).
// 방/메시지 구조는 전혀 변경 없음 — 상수 두 줄만 교체하면 되는 게
// "방은 고정, 참여자는 유동" 원칙이 실제로 작동한 사례.
const AI_MODEL_NAME = 'gpt-oss-120b';
const AI_MODEL_API  = 'openai/gpt-oss-120b';

// AI에게 한 번에 넘기는 이 방 메시지 최대 개수. 방 자체는 전부 남아있고
// (append-only, DB는 그대로), 이건 매 호출마다 "지금 얼마나 읽힐지"만
// 제한하는 것 — Groq 무료 티어 분당 토큰 한도(8000 TPM) 대응.
const THREAD_WINDOW = 6;
const THREAD_MSG_CHAR_LIMIT = 300;
const EXTERNAL_REF_LIMIT = 2;
const EXTERNAL_REF_CHAR_LIMIT = 250;

const AUTHOR_TYPES = ['human', 'ai'] as const;
const MSG_TYPES = [
  'doc_injection', 'understanding', 'question',
  'answer', 'decision', 'issue', 'work_result',
] as const;

type Msg = {
  id: string;
  author_type: string;
  author_name: string;
  msg_type: string;
  content: string;
  ref_ids: string[];
  created_at: string;
};

// 방의 메시지가 다른 방을 ref_ids로 가리킬 때, 그 참조가 링크로만 남고
// 끝나지 않도록 실제 내용을 따라가서 가져온다.
// (오늘 확정한 "이웃 관계 - 마당 공유" 철학을 AI 컨텍스트 생성에도 적용)
async function fetchExternalRefs(thread: Msg[]): Promise<Msg[]> {
  const localIds = new Set(thread.map((m) => m.id));
  const allRefIds = new Set<string>();
  for (const m of thread) {
    (m.ref_ids || []).forEach((id) => allRefIds.add(id));
  }
  const externalIds = Array.from(allRefIds).filter((id) => !localIds.has(id));
  if (externalIds.length === 0) return [];

  const data = await supabaseGet(
    `hajun_messages?id=in.(${externalIds.join(',')})&order=created_at.asc`
  );
  return data || [];
}

function createTraceId() {
  return 'tr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ── 공통 insert 헬퍼 (throw 없이 _error 반환) ────────────────────
async function supabaseInsert(
  table: string,
  body: Record<string, unknown>
): Promise<{ data?: Record<string, unknown>[]; _error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { _error: `Supabase INSERT 실패 (${table}, ${res.status}): ${text}` };
    }
    const data = await res.json();
    return { data };
  } catch (e: unknown) {
    return { _error: e instanceof Error ? e.message : String(e) };
  }
}

// ── 마당 key → id 조회 ───────────────────────────────────────────
async function getYardByKey(key: string) {
  const data = await supabaseGet(`hajun_yards?key=eq.${encodeURIComponent(key)}&limit=1`);
  return data?.[0] || null;
}

// ── 마당 산하 방 목록 조회 ─────────────────────────────────────────
async function getRoomsByYardId(yardId: string) {
  return supabaseGet(
    `hajun_rooms?yard_id=eq.${yardId}&order=created_at.asc`
  );
}

// ── room_id 또는 (yard_key + room_key)로 방 하나 확정 ────────────
async function resolveRoomId(params: {
  room_id?: string;
  yard_key?: string;
  room_key?: string;
}): Promise<{ room_id?: string; _error?: string }> {
  if (params.room_id) return { room_id: params.room_id };

  if (!params.yard_key || !params.room_key) {
    return { _error: 'room_id 또는 (yard_key + room_key)가 필요합니다' };
  }
  const yard = await getYardByKey(params.yard_key);
  if (!yard) return { _error: `마당을 찾을 수 없습니다: ${params.yard_key}` };

  const rooms = await supabaseGet(
    `hajun_rooms?yard_id=eq.${yard.id}&key=eq.${encodeURIComponent(params.room_key)}&limit=1`
  );
  if (!rooms || rooms.length === 0) {
    return { _error: `방을 찾을 수 없습니다: ${params.yard_key}/${params.room_key}` };
  }
  return { room_id: rooms[0].id };
}

// ── 두뇌 AI 호출: 방의 기록을 그대로 읽혀서 답을 받는다 ───────────
// context_package 없음. 이 방의 원본 메시지 나열이 곧 맥락이다.
async function callBrainAI(
  roomName: string,
  fullThread: Msg[],
  targetContent: string,
  externalRefs: Msg[]
): Promise<{ text?: string; _error?: string }> {
  if (!GROQ_KEY) return { _error: 'GROQ_API_KEY 환경변수 미설정' };

  // 방은 전부 저장되어 있지만, 매 호출마다 전부 다시 읽히면 방이 자랄수록
  // 토큰 한도를 넘는다. 최근 것 위주로만 이번 호출의 맥락을 구성한다.
  const windowed = fullThread.slice(-THREAD_WINDOW);
  const omitted = fullThread.length - windowed.length;

  const threadText = windowed
    .map((m) => {
      const content = m.content.length > THREAD_MSG_CHAR_LIMIT
        ? m.content.slice(0, THREAD_MSG_CHAR_LIMIT) + '...(생략)'
        : m.content;
      return `[${m.author_type === 'human' ? '사람' : 'AI'}·${m.author_name}·${m.msg_type}] ${content}`;
    })
    .join('\n\n');

  const limitedExternal = externalRefs.slice(0, EXTERNAL_REF_LIMIT);
  const externalText = limitedExternal
    .map((m) => {
      const content = m.content.length > EXTERNAL_REF_CHAR_LIMIT
        ? m.content.slice(0, EXTERNAL_REF_CHAR_LIMIT) + '...(생략)'
        : m.content;
      return `[다른 방·${m.author_type === 'human' ? '사람' : 'AI'}·${m.author_name}·${m.msg_type}] ${content}`;
    })
    .join('\n\n');

  const prompt = `당신은 지금 "${roomName}" 방에 들어와 있는 하준아이의 참여자입니다.
당신은 특정 모델에 고정되지 않습니다. 입주자는 언제든 교체될 수 있고, 지금은 당신 차례입니다.
이 방에 쌓인 기록이 당신의 유일한 맥락입니다. 매번 새로 시작하는 것이 아니라, 이 기록을 딛고 이어가세요.
이 방의 메시지가 다른 방의 메시지를 참조(ref_ids)하고 있다면, 그 참조된 내용도 아래에 함께 주어집니다 -
그것도 당신이 실제로 읽은 기록으로 취급하세요.
${omitted > 0 ? `아래는 이 방의 가장 최근 ${THREAD_WINDOW}개 기록입니다. 이보다 ${omitted}개 더 오래된 기록이 이 방에 있지만 이번엔 생략됐습니다.` : ''}

규칙:
- 아래 기록(이 방 + 참조된 다른 방)에 없는 내용은 지어내지 말고, 모르면 모른다고 하세요.
- 마크다운 금지 (**, ##, - 목록 등 쓰지 말 것).
- 한국어로만, 핵심만 간결하게 답하세요.

=== 이 방의 지난 기록 ===
${threadText || '(아직 기록 없음)'}

=== 이 방의 메시지가 참조하고 있는, 다른 방의 기록 ===
${externalText || '(참조된 것 없음)'}

=== 지금 답해야 할 부분 ===
${targetContent}`;

  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL_API,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.4,
        max_tokens: 700,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { _error: `두뇌 AI 호출 오류: ${errText}` };
    }
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    return { text };
  } catch (e: unknown) {
    return { _error: e instanceof Error ? e.message : String(e) };
  }
}

// ═══════════════════════════════════════════════════════════════
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const traceId = createTraceId();

  try {
    // ── 마당 목록 ──────────────────────────────────────────────
    if (action === 'yard_list') {
      const data = await supabaseGet('hajun_yards?order=created_at.asc');
      return Response.json({ payload: data, traceId });
    }

    // ── 마당 산하 방 목록 ──────────────────────────────────────
    if (action === 'room_list') {
      const yardKey = searchParams.get('yard');
      if (!yardKey) return Response.json({ _error: 'yard 파라미터 필요', traceId }, { status: 200 });

      const yard = await getYardByKey(yardKey);
      if (!yard) return Response.json({ _error: `마당을 찾을 수 없습니다: ${yardKey}`, traceId }, { status: 200 });

      const rooms = await getRoomsByYardId(yard.id);
      return Response.json({ payload: { yard, rooms }, traceId });
    }

    // ── 방 뷰: 방 하나의 전체 메시지 이력 (깊게) ──────────────
    if (action === 'view_room') {
      const roomId = searchParams.get('room_id');
      if (!roomId) return Response.json({ _error: 'room_id 파라미터 필요', traceId }, { status: 200 });

      const room = await supabaseGet(`hajun_rooms?id=eq.${roomId}&limit=1`);
      if (!room || room.length === 0) {
        return Response.json({ _error: `방을 찾을 수 없습니다: ${roomId}`, traceId }, { status: 200 });
      }

      const messages = await supabaseGet(
        `hajun_messages?room_id=eq.${roomId}&order=created_at.asc`
      );
      return Response.json({ payload: { room: room[0], messages }, traceId });
    }

    // ── 거실 뷰: 마당 산하 각 방의 최신 N개씩 ──────────────────
    if (action === 'view_livingroom') {
      const yardKey = searchParams.get('yard');
      const limit = Number(searchParams.get('limit') || '5');
      if (!yardKey) return Response.json({ _error: 'yard 파라미터 필요', traceId }, { status: 200 });

      const yard = await getYardByKey(yardKey);
      if (!yard) return Response.json({ _error: `마당을 찾을 수 없습니다: ${yardKey}`, traceId }, { status: 200 });

      const rooms = await getRoomsByYardId(yard.id);
      const withMessages = await Promise.all(
        (rooms || []).map(async (room: { id: string }) => {
          const messages = await supabaseGet(
            `hajun_messages?room_id=eq.${room.id}&order=created_at.desc&limit=${limit}`
          );
          return { ...room, messages };
        })
      );

      return Response.json({ payload: { yard, rooms: withMessages }, traceId });
    }

    // ── 마당 뷰: 마당 산하 각 방의 최신 1개씩만 (가장 얕고 넓게) ─
    if (action === 'view_yard') {
      const yardKey = searchParams.get('yard');
      if (!yardKey) return Response.json({ _error: 'yard 파라미터 필요', traceId }, { status: 200 });

      const yard = await getYardByKey(yardKey);
      if (!yard) return Response.json({ _error: `마당을 찾을 수 없습니다: ${yardKey}`, traceId }, { status: 200 });

      const rooms = await getRoomsByYardId(yard.id);
      const withLatest = await Promise.all(
        (rooms || []).map(async (room: { id: string }) => {
          const messages = await supabaseGet(
            `hajun_messages?room_id=eq.${room.id}&order=created_at.desc&limit=1`
          );
          return { ...room, latest: messages?.[0] || null };
        })
      );

      return Response.json({ payload: { yard, rooms: withLatest }, traceId });
    }

    return Response.json({ _error: '알 수 없는 action', traceId }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
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

    // ── 메시지 작성: 참여자가 방에 포스팅 ─────────────────────
    if (action === 'post_message') {
      const {
        room_id, yard_key, room_key,
        author_type, author_name, msg_type, content, ref_ids = [],
      } = body as {
        room_id?: string; yard_key?: string; room_key?: string;
        author_type?: string; author_name?: string;
        msg_type?: string; content?: string; ref_ids?: string[];
      };

      if (!author_type || !AUTHOR_TYPES.includes(author_type as typeof AUTHOR_TYPES[number])) {
        return Response.json({ _error: `author_type은 ${AUTHOR_TYPES.join('|')} 중 하나여야 합니다`, traceId }, { status: 200 });
      }
      if (!author_name || typeof author_name !== 'string') {
        return Response.json({ _error: 'author_name 필요', traceId }, { status: 200 });
      }
      if (!msg_type || !MSG_TYPES.includes(msg_type as typeof MSG_TYPES[number])) {
        return Response.json({ _error: `msg_type은 ${MSG_TYPES.join('|')} 중 하나여야 합니다`, traceId }, { status: 200 });
      }
      if (!content || typeof content !== 'string' || content.trim() === '') {
        return Response.json({ _error: 'content 필요', traceId }, { status: 200 });
      }
      if (!Array.isArray(ref_ids)) {
        return Response.json({ _error: 'ref_ids는 배열이어야 합니다', traceId }, { status: 200 });
      }

      const resolved = await resolveRoomId({ room_id, yard_key, room_key });
      if (resolved._error) {
        return Response.json({ _error: resolved._error, traceId }, { status: 200 });
      }

      const result = await supabaseInsert('hajun_messages', {
        room_id: resolved.room_id,
        author_type,
        author_name,
        msg_type,
        content,
        ref_ids,
      });
      if (result._error) {
        return Response.json({ _error: result._error, traceId }, { status: 200 });
      }

      return Response.json({ payload: result.data?.[0] || null, traceId });
    }

    // ── 새 방 생성 (마당 산하, 방은 고정 — 신중하게 생성) ──────
    if (action === 'room_create') {
      const { yard_key, key, name } = body as { yard_key?: string; key?: string; name?: string };

      if (!yard_key || !key || !name) {
        return Response.json({ _error: 'yard_key, key, name 모두 필요', traceId }, { status: 200 });
      }

      const yard = await getYardByKey(yard_key);
      if (!yard) return Response.json({ _error: `마당을 찾을 수 없습니다: ${yard_key}`, traceId }, { status: 200 });

      const result = await supabaseInsert('hajun_rooms', {
        yard_id: yard.id,
        key,
        name,
      });
      if (result._error) {
        return Response.json({ _error: result._error, traceId }, { status: 200 });
      }

      return Response.json({ payload: result.data?.[0] || null, traceId });
    }

    // ── 두뇌 AI 참여: 방을 읽고 답을 남긴다 ─────────────────────
    // body: {
    //   room_id, yard_key?, room_key?,
    //   ref_ids: string[]   ← "이 메시지들 보고 답해줘" (사람이 명시적으로 지정)
    // }
    // - context_package 없음. AI는 이 방의 전체 원본 메시지를 그대로 읽는다.
    // - ref_ids가 비어있으면 방의 가장 최근 메시지를 대상으로 삼는다.
    // - 응답은 author_type:'ai', author_name: 현재 입주 모델명으로 저장된다.
    if (action === 'ai_respond') {
      const { room_id, yard_key, room_key, ref_ids = [] } = body as {
        room_id?: string; yard_key?: string; room_key?: string; ref_ids?: string[];
      };

      const resolved = await resolveRoomId({ room_id, yard_key, room_key });
      if (resolved._error) {
        return Response.json({ _error: resolved._error, traceId }, { status: 200 });
      }
      const roomId = resolved.room_id!;

      const roomData = await supabaseGet(`hajun_rooms?id=eq.${roomId}&limit=1`);
      if (!roomData || roomData.length === 0) {
        return Response.json({ _error: `방을 찾을 수 없습니다: ${roomId}`, traceId }, { status: 200 });
      }
      const room = roomData[0];

      // 방을 스스로 읽는다 — 이게 context_package를 대체하는 전부다.
      const thread: Msg[] = await supabaseGet(
        `hajun_messages?room_id=eq.${roomId}&order=created_at.asc`
      );

      if (!thread || thread.length === 0) {
        return Response.json({ _error: '이 방에 아직 기록이 없어 답할 근거가 없습니다', traceId }, { status: 200 });
      }

      // 이 방의 메시지들이 다른 방을 ref_ids로 가리키고 있다면 실제로 따라가서 읽는다.
      const externalRefs = await fetchExternalRefs(thread);

      // 지금 답해야 할 부분: 사람이 지정한 ref_ids가 있으면 그 메시지들,
      // 없으면 방의 가장 최근 메시지.
      let targetMsgs = thread.filter((m) => ref_ids.includes(m.id));
      if (targetMsgs.length === 0) {
        targetMsgs = [thread[thread.length - 1]];
      }
      const targetContent = targetMsgs
        .map((m) => `[${m.author_name}] ${m.content}`)
        .join('\n');
      const effectiveRefIds = targetMsgs.map((m) => m.id);

      const aiResult = await callBrainAI(room.name, thread, targetContent, externalRefs);
      if (aiResult._error) {
        return Response.json({ _error: aiResult._error, traceId }, { status: 200 });
      }

      const insertResult = await supabaseInsert('hajun_messages', {
        room_id: roomId,
        author_type: 'ai',
        author_name: AI_MODEL_NAME,
        msg_type: 'answer',
        content: aiResult.text,
        ref_ids: effectiveRefIds,
      });
      if (insertResult._error) {
        return Response.json({ _error: insertResult._error, traceId }, { status: 200 });
      }

      return Response.json({ payload: insertResult.data?.[0] || null, traceId });
    }

    return Response.json({ _error: '알 수 없는 action', traceId }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
  }
}