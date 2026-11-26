import { createTraceId } from '@/lib/hajunApiCore';
import { handleUploadSource } from '@/lib/uploadSourceAction';

/**
 * P1 Source upload — CONTRACT 2026-11-26
 * Source once in hajun_messages (doc_injection / work_document).
 * Room is caller-specified; server validates room exists.
 * Does not run Hermes. Does not mutate existing Source content.
 */
export async function POST(req: Request) {
  const traceId = createTraceId();
  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody.replace(/^\uFEFF/, ''));
    return handleUploadSource(body, traceId);
  } catch (e) {
    return Response.json(
      { _error: e instanceof Error ? e.message : String(e), traceId },
      { status: 200 },
    );
  }
}
