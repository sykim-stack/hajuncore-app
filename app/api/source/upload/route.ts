import { createTraceId } from '@/lib/hajunApiCore';
import { handleUploadSource } from '@/lib/uploadSourceAction';

export const dynamic = 'force-dynamic';

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] || '';
}

/**
 * P1 Source upload.
 * The browser passes its existing Supabase Auth access_token.
 * No new auth flow or handoff ticket is created for this same-app request.
 */
export async function POST(req: Request) {
  const traceId = createTraceId();
  const token = bearerToken(req);

  if (!token) {
    return Response.json(
      { _error: 'auth_required', traceId },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody.replace(/^\uFEFF/, ''));
    return handleUploadSource(body, traceId, token);
  } catch (e) {
    return Response.json(
      { _error: e instanceof Error ? e.message : String(e), traceId },
      { status: 400, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
