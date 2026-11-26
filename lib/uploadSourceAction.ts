// lib/uploadSourceAction.ts
// P1 Source upload — CONTRACT 2026-11-26
import { createHash } from 'crypto';
import {
  getRoomByKeys,
  insertHajunMessage,
  supabaseGet,
} from '@/lib/hajunApiCore';
import { resolveSourcePrincipal } from '@/lib/sourceAuth';

export type UploadSourceBody = {
  content?: string;
  title?: string;
  room_id?: string;
  yard_key?: string;
  room_key?: string;
  author_name?: string;
  content_type?: string;
};

function jsonError(error: string, traceId: string, status = 400) {
  return Response.json(
    { _error: error, traceId },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function handleUploadSource(
  body: UploadSourceBody,
  traceId: string,
  accessToken: string,
): Promise<Response> {
  const principal = await resolveSourcePrincipal(accessToken);
  if (!principal.ok) {
    return jsonError(principal.error, traceId, principal.status);
  }

  const {
    content,
    title,
    room_id: bodyRoomId,
    yard_key,
    room_key,
    author_name,
    content_type,
  } = body || {};

  let room_id = typeof bodyRoomId === 'string' ? bodyRoomId.trim() : '';
  if (!room_id && yard_key && room_key) {
    const resolved = await getRoomByKeys(yard_key, room_key);
    if ('_error' in resolved) {
      return jsonError(resolved._error, traceId, 404);
    }
    room_id = resolved.room.id as string;
  }
  if (!room_id) {
    return jsonError('room_id 또는 yard_key+room_key가 필요합니다 (호출자가 방 지정)', traceId);
  }

  const bodyText = typeof content === 'string' ? content.trim() : '';
  if (!bodyText) {
    return jsonError('content가 비어 있습니다 (P1 text Source만)', traceId);
  }
  if (bodyText.includes('\0')) {
    return jsonError('binary content는 P1 범위 밖입니다', traceId);
  }

  // Current HajunCore schema has no owner column on hajun_yards/hajun_rooms.
  // The active CoreHub owner-link is therefore the existing workspace-level
  // authorization boundary; this code does not invent per-room ownership.
  const rooms = await supabaseGet(
    `hajun_rooms?id=eq.${encodeURIComponent(room_id)}&select=id,yard_id,key,name&limit=1`,
  );
  if (!Array.isArray(rooms) || rooms.length === 0) {
    return jsonError('방을 찾을 수 없거나 접근할 수 없습니다', traceId, 404);
  }

  const content_hash = createHash('sha256').update(bodyText, 'utf8').digest('hex');
  const safeTitle = typeof title === 'string' ? title.trim().slice(0, 200) : '';
  const safeType =
    typeof content_type === 'string' && content_type.trim()
      ? content_type.trim().slice(0, 80)
      : 'text/markdown';
  const safeAuthor =
    typeof author_name === 'string' && author_name.trim()
      ? author_name.trim().slice(0, 80)
      : 'human';

  const metadata: Record<string, unknown> = {
    entity_type: 'work_document',
    content_hash,
    content_type: safeType,
    source_once: true,
    hermes_auto: false,
  };
  if (safeTitle) metadata.title = safeTitle;

  const saved = await insertHajunMessage({
    room_id,
    author_type: 'human',
    author_name: safeAuthor,
    msg_type: 'doc_injection',
    content: bodyText,
    ref_ids: [],
    metadata,
  });
  if (saved._error) {
    return jsonError(saved._error, traceId, 500);
  }
  const row = (saved.data?.[0] || null) as Record<string, unknown> | null;
  const source_id = row && typeof row.id === 'string' ? row.id : null;
  if (!source_id) {
    return jsonError('Source 저장 후 id를 받지 못했습니다', traceId, 500);
  }

  return Response.json(
    {
      payload: {
        source_id,
        room_id,
        content_hash,
        msg_type: 'doc_injection',
        entity_type: 'work_document',
      },
      traceId,
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
