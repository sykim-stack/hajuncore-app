export const dynamic = 'force-dynamic';

const COREHUB_API_URL = process.env.COREHUB_API_URL;

function tokenFromRequest(request: Request): string {
  const authorization = request.headers.get('authorization') || '';
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  if (match) return match[1];

  const cookie = (request.headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('corehub_session='));
  if (!cookie) return '';
  try {
    return decodeURIComponent(cookie.slice('corehub_session='.length));
  } catch {
    return '';
  }
}

export async function POST(request: Request) {
  const traceId = crypto.randomUUID();

  if (!COREHUB_API_URL) {
    return Response.json({ _error: 'corehub_url_not_configured', traceId }, { status: 503 });
  }

  let body: { audience?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    // audience may be omitted; CoreHub will validate
  }

  const audience =
    body?.audience === 'corering' || body?.audience === 'corenull'
      ? body.audience
      : 'corenull';

  const token = tokenFromRequest(request);
  if (!token) {
    return Response.json({ _error: 'auth_required', traceId }, { status: 401 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${COREHUB_API_URL}/api/auth/handoffs`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ audience }),
    });
  } catch {
    return Response.json({ _error: 'corehub_unavailable', traceId }, { status: 503 });
  }

  const result = await upstream.json().catch(() => null);
  const status = upstream.status;
  if (!upstream.ok) {
    return Response.json(
      { _error: result?._error || result?.error || 'handoff_issue_failed', traceId },
      { status: status === 401 || status === 400 ? status : 503 },
    );
  }

  return Response.json(
    {
      data: result?.data,
      traceId,
    },
    { status: 201, headers: { 'Cache-Control': 'no-store' } },
  );
}
