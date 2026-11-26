// lib/uploadSourceAction.ts
// P1 Source upload — CONTRACT 2026-11-26
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import {
  getRoomByKeys,
  insertHajunMessage,
  supabaseGet,
  SUPABASE_URL,
  SUPABASE_KEY,
} from '@/lib/hajunApiCore';

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

function createRequestAuthClient() {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function handleUploadSource(
  body: UploadSourceBody,
  traceId: string,
  accessToken: string,
): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return jsonError('auth_configuration_missing', traceId, 503);
  }

  // Validate the existing Supabase Auth session with Auth server.
  // Create a request-scoped client so no user's auth state is shared between requests.
  let authClient: ReturnType<typeof createRequestAuthClient>;
  try {
    authClient = createRequestAuthClient();
  } catch {
    return jsonError('auth_client_initialization_failed', traceId, 503);
  }

  let authUserId = '';
  try {
    const { data, error } = await authClient.auth.getUser(accessToken);
    if (error || !data.user?.id) {
      return jsonError('invalid_or_expired_session', traceId, 401);
    }
    authUserId = data.user.id;
  } catch {
    return jsonError('auth_verification_unavailable', traceId, 503);
  }

  // Reuse CoreHub's existing principal → owner_key mapping.
  // Never accept owner_key from the request body.
  let hasActiveOwnerLink = false;
  try {
    const { data, error } = await authClient
      .schema('corehub')
      .from('auth_owner_links')
      .select('owner_key')
      .eq('auth_user_id', authUserId)
      .is('revoked_at', null);

    if (error) {
      return jsonError('principal_mapping_unavailable', traceId, 503);
    }

    hasActiveOwnerLink = (data || []).some(
      (row: { owner_key?: unknown }) =>
        typeof row.owner_key === 'string' && row.owner_key.trim().length > 0,
    );
  } catch {
    return jsonError('principal_mapping_unavailable', traceId, 503);
  }

  if (!hasActiveOwnerLink) {
    return jsonError('owner_not_linked', traceId, 403);
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
  // Therefore the existing linked-owner scope is the workspace-level write boundary:
  // only a signed-in principal with an active CoreHub owner link may write to an
  // existing HajunCore room. No per-room ownership relation is fabricated here.
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
