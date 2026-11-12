// lib/hajunApiPost.ts — temporary stub (restore from artifacts/hajunApiPost_RESTORE_max2500.ts)
export async function POST(req: Request) {
  return Response.json({
    _error: 'hajunApiPost 복구 중. artifacts/hajunApiPost_RESTORE_max2500.ts 를 lib/hajunApiPost.ts 로 복사 후 푸시해주세요.',
    traceId: 'restore-pending',
  }, { status: 200 });
}
