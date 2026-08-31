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
//
// action 목록 (Vercel Hobby 12-route 한도 유지를 위해 단일 라우트 유지):
//   GET  yard_list                         → 마당 목록
//   GET  room_list      &yard=<key>        → 마당 산하 방 목록
//   GET  view_room       &room_id=<uuid>   → 방 뷰 (전체 이력, 깊게)
//   GET  view_livingroom &yard=<key>&limit=<n> → 거실 뷰 (방별 최신 N개)
//   GET  view_yard       &yard=<key>       → 마당 뷰 (방별 최신 1개)
//   POST post_message                       → 메시지 작성 (참여자가 방에 포스팅)
//   POST room_create                        → 새 방 생성 (마당 산하)

import { supabaseGet } from '@/lib/supabase';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;

const AUTHOR_TYPES = ['human', 'ai'] as const;
const MSG_TYPES = [
  'doc_injection', 'understanding', 'question',
  'answer', 'decision', 'issue', 'work_result',
] as const;

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
    // body: {
    //   room_id?, yard_key?, room_key?,   ← room_id 또는 yard_key+room_key
    //   author_type: 'human' | 'ai',
    //   author_name: string,
    //   msg_type: 'doc_injection'|'understanding'|'question'|'answer'|'decision'|'issue'|'work_result',
    //   content: string,
    //   ref_ids?: string[]   ← 이 메시지가 딛고 선 이전 메시지들
    // }
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
    // body: { yard_key, key, name }
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

    return Response.json({ _error: '알 수 없는 action', traceId }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
  }
}