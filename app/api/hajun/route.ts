// app/api/hajun/route.ts
// BRAINPOOL 계약: throw 금지, _error 필드 사용, 200/500만
// GET: yard_list | room_list | view_room | view_yard | view_livingroom
//      product_candidates | product_random | product_timeline
//      listing_queue | listing_timeline
//      contexts | dev_contexts | snapshots | sync_snapshot
// POST: post_message | ai_respond | chat | update_context | synthesize_context
// 축소 배포 금지. full surface는 lib/hajunApiHandlers 경유.
export { GET, POST } from '@/lib/hajunApiHandlers';
