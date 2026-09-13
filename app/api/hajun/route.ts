// app/api/hajun/route.ts
// BRAINPOOL 계약: throw 금지, _error 필드 사용, 200/500만
// action: contexts | dev_contexts | snapshots | update_context | chat | summarize_context | sync_snapshot | synthesize_context
// 계약: 원본=Message/Knowledge Unit, contexts=HajunAI 현재 이해, last_synthesized_at=종합 시점
export { GET, POST } from '@/lib/hajunApiHandlers';
