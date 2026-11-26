import { createTraceId, supabaseGet } from '@/lib/hajunApiCore';
import { resolveSourcePrincipal } from '@/lib/sourceAuth';

export const dynamic = 'force-dynamic';

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] || '';
}

function errorResponse(error: string, traceId: string, status: number) {
  return Response.json(
    { _error: error, traceId },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function GET(request: Request) {
  const traceId = createTraceId();
  const token = bearerToken(request);
  if (!token) return errorResponse('auth_required', traceId, 401);

  const principal = await resolveSourcePrincipal(token);
  if (!principal.ok) return errorResponse(principal.error, traceId, principal.status);

  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') || 'original';
  if (!['original', 'brainpool', 'warehouse'].includes(scope)) {
    return errorResponse('invalid_scope', traceId, 400);
  }

  const yardKeys =
    scope === 'brainpool'
      ? ['gwanje', 'gaebal', 'brainpool']
      : scope === 'warehouse'
        ? ['product_validation', 'product_listing']
        : null;

  const [yardsResult, roomsResult] = await Promise.all([
    supabaseGet('hajun_yards?select=id,key,name'),
    supabaseGet('hajun_rooms?select=id,yard_id,key,name'),
  ]);

  const yards = Array.isArray(yardsResult) ? yardsResult : [];
  const allRooms = Array.isArray(roomsResult) ? roomsResult : [];
  const visibleYards = yardKeys ? yards.filter((yard: { key?: string }) => yardKeys.includes(yard.key || '')) : yards;
  const visibleYardIds = new Set(visibleYards.map((yard: { id: string }) => yard.id));
  const visibleRooms = allRooms.filter((room: { yard_id?: string }) => visibleYardIds.has(room.yard_id || ''));
  const roomIds = visibleRooms
    .map((room: { id?: string }) => room.id)
    .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);

  if (roomIds.length === 0) {
    return Response.json(
      { payload: { items: [], count: 0, scope }, traceId },
      { status: 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const roomFilter = `&room_id=in.(${roomIds.map(encodeURIComponent).join(',')})`;
  const messages = await supabaseGet(
    `hajun_messages?msg_type=eq.doc_injection${roomFilter}&order=created_at.desc&limit=100`,
  );

  const yardById = new Map(visibleYards.map((yard: { id: string }) => [yard.id, yard]));
  const roomById = new Map(visibleRooms.map((room: { id: string }) => [room.id, room]));
  const items = (Array.isArray(messages) ? messages : []).map((message: Record<string, unknown>) => {
    const room = roomById.get(String(message.room_id)) as Record<string, unknown> | undefined;
    const yard = room ? yardById.get(String(room.yard_id)) as Record<string, unknown> | undefined : undefined;
    return { ...message, room: room || null, yard: yard || null };
  });

  return Response.json(
    { payload: { items, count: items.length, scope }, traceId },
    { status: 200, headers: { 'Cache-Control': 'no-store' } },
  );
}
