// app/api/hermes/route.ts
//
// HajunAI → Hermes Agent 실행 도구 (MVP-0)
//
//   GET  ?action=health
//        → { payload: { reachable, version, auth_required, base_url }, traceId }
//
//   POST { prompt, session_id?, cwd?, timeout_ms?, source? }
//        → { payload: { session_id, text, status, usage, events, duration_ms }, traceId }
//        오류 → { _error, traceId }  (status 200)
//
// 계약 (BRAINPOOL): throw 금지 · _error 필드 사용 · 200만.
//   Hermes 실패(미실행·시간 초과·승인 대기)도 200 + _error 로 돌려준다 —
//   판단은 하준아이와 사람이 한다.
//
// 전제: 이 PC 에서 `hermes serve` 가 127.0.0.1:9119 로 실행 중이어야 한다.
//       (`hermes serve --status` 로 확인, 없으면 `hermes serve`)
//
// 실행 인터페이스 자체(에이전트 호출)는 lib/hermesClient.ts 에 있다.

import { hermesHealth, hermesRun } from '@/lib/hermesClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/** lib/hajunApiCore.createTraceId 와 같은 형식 — 이 라우트는 core 를 import 하지 않는다. */
function createTraceId() {
  return 'tr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

export async function GET() {
  const traceId = createTraceId();
  const health = await hermesHealth();
  return Response.json({ payload: health, traceId }, { status: 200 });
}

export async function POST(request: Request) {
  const traceId = createTraceId();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ _error: 'JSON 본문이 필요합니다', traceId }, { status: 200 });
  }

  const prompt =
    typeof body.prompt === 'string'
      ? body.prompt
      : typeof body.query === 'string'
        ? (body.query as string)
        : '';

  if (!prompt.trim()) {
    return Response.json({ _error: 'prompt 가 필요합니다', traceId }, { status: 200 });
  }

  const result = await hermesRun({
    prompt,
    session_id: typeof body.session_id === 'string' ? body.session_id : undefined,
    cwd: typeof body.cwd === 'string' ? body.cwd : undefined,
    source: typeof body.source === 'string' ? body.source : undefined,
    timeout_ms: typeof body.timeout_ms === 'number' ? body.timeout_ms : undefined,
  });

  if (result._error) {
    return Response.json(
      { _error: result._error, session_id: result.session_id, traceId },
      { status: 200 }
    );
  }

  return Response.json({ payload: result, traceId }, { status: 200 });
}
