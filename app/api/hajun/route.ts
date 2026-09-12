// app/api/hajun/route.ts
// BRAINPOOL 계약: throw 금지, _error 필드 사용, 200/500만
// action: contexts | dev_contexts | snapshots | update_context | chat | summarize_context | sync_snapshot
// [CoreNull UI 정리 2026-09-06] 기존 마당·방 View 라우트도 유지한다. 마당은 자동 병합이 아니라 명시적 URL 방문 범위다.

import { supabaseGet, supabasePatch } from '@/lib/supabase';
import {
  buildInternalCode,
  isReviewPendingMetadata,
  normalizeProductMetadata,
  selectRandomCandidate,
  withReviewStatus,
  type ProductCandidateMessage,
  type ProductCandidateMetadata,
} from '@/lib/productValidation';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GEMINI_KEY  = process.env.GEMINI_API_KEY!;
const GROQ_KEY    = process.env.GROQ_API_KEY!;
const HOUSE_ID    = '6341b872-4555-4fdc-8f1d-8009b2b1764f';
const COREHUB_URL = process.env.COREHUB_URL || 'https://brainpool-corehub.vercel.app';

function createTraceId() {
  return 'tr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// [CoreNull UI 정리 2026-09-06] 관제마당·개발마당·브라이언풀마당의 원본 조회 헬퍼.
async function getYardByKey(key: string) {
  const data = await supabaseGet(`hajun_yards?key=eq.${encodeURIComponent(key)}&limit=1`);
  return data?.[0] || null;
}

async function getRoomsByYardId(yardId: string) {
  return supabaseGet(`hajun_rooms?yard_id=eq.${yardId}&order=created_at.asc`);
}

// [상품검증 MVP 2026-09-09]
// 상품 원문은 hajun_messages에만 두고 metadata.entity_type으로 후보를 식별한다.
// metadata 컬럼이 없는 기존 DB에서도 전체 메시지 조회가 실패하지 않도록 후단에서 필터링한다.
async function getProductCandidateMessages(roomId?: string): Promise<ProductCandidateMessage[]> {
  const roomFilter = roomId ? `&room_id=eq.${encodeURIComponent(roomId)}` : '';
  const rows = await supabaseGet(`hajun_messages?order=created_at.asc&limit=500${roomFilter}`);
  return (rows || []).filter((row: Record<string, unknown>) => {
    const metadata = row.metadata as Record<string, unknown> | null | undefined;
    return metadata?.entity_type === 'product_candidate'
      && typeof metadata.internal_code === 'string'
      && typeof metadata.source === 'string'
      && typeof metadata.source_product_code === 'string';
  }) as ProductCandidateMessage[];
}

async function insertHajunMessage(body: Record<string, unknown>) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/hajun_messages`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { _error: `메시지 저장 실패: ${await res.text()}` };
    return { data: await res.json() };
  } catch (e) {
    return { _error: e instanceof Error ? e.message : String(e) };
  }
}

function buildSnapshotSummary(content: Record<string, unknown>): string {
  const house   = (content?.house   || {}) as Record<string, string>;
  const summary = (content?.summary || {}) as Record<string, number>;
  const rooms   = (content?.rooms   || []) as Array<Record<string, unknown>>;
  const parts: string[] = [];
  if (house.title) parts.push(`${house.title} (${house.primary_language || ''})`);
  if (summary.seed_rooms   > 0) parts.push(`씨앗방 ${summary.seed_rooms}개`);
  if (summary.bloomed_seeds > 0) parts.push(`꽃 ${summary.bloomed_seeds}개`);
  if (summary.total_fruits  > 0) parts.push(`열매 ${summary.total_fruits}개`);
  if (summary.total_harvested > 0) parts.push(`수확 ${summary.total_harvested}개`);
  parts.push(`메시지 ${summary.total_messages || 0}개`);
  const seedRooms = rooms.filter(r => r.seed_mode);
  if (seedRooms.length > 0)
    parts.push(`씨앗: ${seedRooms.map(r => r.room_name).join(', ')}`);
  return parts.join(' · ');
}

function buildSnapshotKeywords(content: Record<string, unknown>): string[] {
  const house   = (content?.house   || {}) as Record<string, string>;
  const summary = (content?.summary || {}) as Record<string, number>;
  const rooms   = (content?.rooms   || []) as Array<Record<string, unknown>>;
  const kw: string[] = ['life', 'CoreNull'];
  if (house.primary_language) kw.push(`lang_${house.primary_language}`);
  if (summary.seed_rooms   > 0) kw.push('seed_active');
  if (summary.bloomed_seeds > 0) kw.push('bloomed');
  if (summary.total_fruits  > 0) kw.push('fruit');
  if (summary.total_harvested > 0) kw.push('harvested');
  if (rooms.some((r: Record<string, unknown>) => r.visibility === 'public'))  kw.push('public_space');
  if (rooms.some((r: Record<string, unknown>) => r.visibility === 'family'))  kw.push('family_space');
  if ((summary.total_messages || 0) > 10) kw.push('high_activity');
  else if ((summary.total_messages || 0) > 0) kw.push('low_activity');
  else kw.push('inactive');
  return kw;
}

function calcSnapshotConfidence(snapshot: Record<string, unknown>): number {
  const summary = ((snapshot.content as Record<string, unknown>)?.summary || {}) as Record<string, number>;
  const ids = (snapshot.source_message_ids as string[]) || [];
  let conf = 0.55;
  if ((summary.total_messages || 0) > 5) conf += 0.10;
  if ((summary.seed_rooms     || 0) > 0) conf += 0.05;
  if ((summary.total_fruits   || 0) > 0) conf += 0.05;
  if (ids.length > 1)                    conf += 0.05;
  return Math.min(conf, 0.90);
}

async function fetchMindWorldSummary(): Promise<string> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/corenull_rooms?house_id=eq.${HOUSE_ID}&order=updated_at.desc&limit=5`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }, cache: 'no-store' }
    );
    if (!res.ok) return '씨앗 데이터 없음';
    const rooms = await res.json();
    if (!rooms || rooms.length === 0) return '씨앗 데이터 없음';
    return rooms
      .map((r: { name?: string; fruit_state?: string; updated_at?: string }) =>
        `- ${r.name || '이름없음'} (${r.fruit_state || 'unknown'}) | ${r.updated_at?.slice(0, 10) || ''}`
      )
      .join('\n');
  } catch {
    return '씨앗 데이터 조회 실패';
  }
}

async function fetchOpportunities(ownerKey: string): Promise<{ text: string; ids: string[] }> {
  if (!ownerKey) return { text: '', ids: [] };
  try {
    const res = await fetch(
      `${COREHUB_URL}/api/corehub/opportunities?owner_key=${encodeURIComponent(ownerKey)}`,
      { headers: { 'Content-Type': 'application/json' }, cache: 'no-store' }
    );
    if (!res.ok) return { text: '', ids: [] };
    const json = await res.json();
    const items = json.data || [];
    if (items.length === 0) return { text: '', ids: [] };
    const top = items.slice(0, 3);
    const ids = top.map((o: { id: string }) => o.id);
    const text = top
      .map((o: { title?: string; description?: string; opportunity_type?: string }) =>
        `- ${o.title || o.description || '발견된 기회'} (${o.opportunity_type || 'opportunity'})`
      )
      .join('\n');
    return { text, ids };
  } catch {
    return { text: '', ids: [] };
  }
}

async function consumeOpportunities(ids: string[], outcome = 'shown'): Promise<void> {
  if (!ids.length) return;
  try {
    await Promise.all(ids.map(id =>
      fetch(`${COREHUB_URL}/api/corehub/opportunities?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outcome }),
      })
    ));
  } catch { /* ignore */ }
}

async function fetchContextSummary(): Promise<string> {
  try {
    const data = await supabaseGet('dev_contexts?order=updated_at.desc&limit=1');
    if (!data || data.length === 0) return '개발 맥락 없음';
    const c = data[0];
    const parts: string[] = [];
    if (c.updated_at)     parts.push(`기록 시각: ${c.updated_at}`);
    if (c.phase)          parts.push(`페이즈(보조 기록): ${c.phase}`);
    if (c.status)         parts.push(`상태(보조 기록): ${c.status}`);
    if (c.last_task)      parts.push(`마지막 작업: ${c.last_task}`);
    if (c.next_action)    parts.push(`다음 액션: ${c.next_action}`);
    if (c.current_problems && c.current_problems !== '없음')
                          parts.push(`현재 문제: ${c.current_problems}`);
    if (c.summary)        parts.push(`요약: ${c.summary}`);
    if (Array.isArray(c.next_tasks) && c.next_tasks.length > 0)
      parts.push(`다음 작업:\n${c.next_tasks.map((t: string) => `  - ${t}`).join('\n')}`);
    return parts.join('\n') || '맥락 데이터 파싱 실패';
  } catch {
    return '개발 맥락 조회 실패';
  }
}

// [HajunAI 전체 맥락 2026-09-06]
// 자동 피드 병합은 하지 않지만, 하준챗을 호출한 순간에는 세 마당을 명시적으로 조회한다.
async function fetchYardContext(): Promise<string> {
  const yards = [
    { key: 'gwanje', label: '관제마당' },
    { key: 'gaebal', label: '개발마당' },
    { key: 'brainpool', label: '브라이언풀마당' },
  ];
  const sections = await Promise.all(yards.map(async ({ key, label }) => {
    try {
      const yard = await getYardByKey(key);
      if (!yard) return `[${label}] 등록된 마당 없음`;
      const rooms = await getRoomsByYardId(yard.id);
      const roomSections = await Promise.all((rooms || []).map(async (room: { id: string; name?: string }) => {
        const messages = await supabaseGet(`hajun_messages?room_id=eq.${room.id}&order=created_at.desc&limit=3`);
        if (!messages?.length) return `방 ${room.name || room.id}: 메시지 없음`;
        return `방 ${room.name || room.id}:\n${messages.reverse().map((m: { author_name?: string; content?: string; created_at?: string }) => `  [${m.created_at || '시각 없음'}] ${m.author_name || '작성자'}: ${(m.content || '').slice(0, 400)}`).join('\n')}`;
      }));
      return `[${label}]\n${roomSections.join('\n') || '방 없음'}`;
    } catch {
      return `[${label}] 조회 실패`;
    }
  }));
  return sections.join('\n\n');
}

async function saveConversation(payload: {
  source_ai: string;
  original_message: string;
  summary: string;
  keywords: string[];
  meta?: Record<string, unknown>;
}) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/hajunai_conversations`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ ...payload, created_at: new Date().toISOString() }),
    });
  } catch { /* ignore */ }
}

async function callGroq(
  systemPrompt: string,
  userMessage: string,
  history: Array<{ role: string; content: string }>
) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...history.map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.content })),
    { role: 'user', content: userMessage },
  ];
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_KEY}`,
    },
    body: JSON.stringify({
      // [Groq 모델 교체 2026-09-06] 폐기된 llama-3.3-70b-versatile 대신 현재 사용 모델.
      model: 'openai/gpt-oss-120b',
      messages,
      temperature: 0.4,
      max_tokens: 1024,
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    return { _error: `Groq API 오류: ${errText}` };
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { text };
}

function parseReply(raw: string): { reply: string; observations: string[] } {
  const obsMarkers = ['관찰:', '관찰 :', 'Observations:', '관찰사항:'];
  let splitIdx = -1;
  let marker = '';
  for (const m of obsMarkers) {
    const idx = raw.indexOf(m);
    if (idx !== -1 && (splitIdx === -1 || idx < splitIdx)) {
      splitIdx = idx;
      marker = m;
    }
  }
  if (splitIdx === -1) return { reply: raw.trim(), observations: [] };
  const reply = raw.slice(0, splitIdx).trim();
  const obsPart = raw.slice(splitIdx + marker.length).trim();
  const observations = obsPart
    .split('\n')
    .map((l) => l.replace(/^[-–•*]\s*/, '').trim())
    .filter(Boolean);
  return { reply, observations };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    // [CoreNull UI 정리 2026-09-06] 마당은 사용자가 직접 방문한 경우에만 조회한다.
    if (action === 'yard_list') {
      const payload = await supabaseGet('hajun_yards?order=created_at.asc');
      return Response.json({ payload, traceId: createTraceId() });
    }

    if (action === 'room_list') {
      const yardKey = searchParams.get('yard');
      if (!yardKey) return Response.json({ _error: 'yard 파라미터 필요' }, { status: 200 });
      const yard = await getYardByKey(yardKey);
      if (!yard) return Response.json({ _error: `마당을 찾을 수 없습니다: ${yardKey}` }, { status: 200 });
      const rooms = await getRoomsByYardId(yard.id);
      return Response.json({ payload: { yard, rooms }, traceId: createTraceId() });
    }

    if (action === 'view_room') {
      const roomId = searchParams.get('room_id');
      if (!roomId) return Response.json({ _error: 'room_id 파라미터 필요' }, { status: 200 });
      const room = await supabaseGet(`hajun_rooms?id=eq.${roomId}&limit=1`);
      if (!room?.length) return Response.json({ _error: `방을 찾을 수 없습니다: ${roomId}` }, { status: 200 });
      const messages = await supabaseGet(`hajun_messages?room_id=eq.${roomId}&order=created_at.asc`);
      return Response.json({ payload: { room: room[0], messages }, traceId: createTraceId() });
    }

    if (action === 'recommendations') {
      const roomId = searchParams.get('room_id');
      if (!roomId) return Response.json({ _error: 'room_id 파라미터 필요' }, { status: 200 });
      const messages = await supabaseGet(`hajun_messages?room_id=eq.${encodeURIComponent(roomId)}&order=created_at.desc&limit=100`);
      const recommendations = (messages || []).filter((message: Record<string, unknown>) => {
        const metadata = message.metadata as Record<string, unknown> | null | undefined;
        return metadata?.entity_type === 'product_recommendation';
      });
      return Response.json({ payload: { recommendations }, traceId: createTraceId() });
    }

    if (action === 'view_livingroom' || action === 'view_yard') {
      const yardKey = searchParams.get('yard');
      if (!yardKey) return Response.json({ _error: 'yard 파라미터 필요' }, { status: 200 });
      const yard = await getYardByKey(yardKey);
      if (!yard) return Response.json({ _error: `마당을 찾을 수 없습니다: ${yardKey}` }, { status: 200 });
      const rooms = await getRoomsByYardId(yard.id);
      const limit = action === 'view_livingroom' ? Number(searchParams.get('limit') || '5') : 1;
      const withMessages = await Promise.all((rooms || []).map(async (room: { id: string }) => {
        const messages = await supabaseGet(`hajun_messages?room_id=eq.${room.id}&order=created_at.desc&limit=${limit}`);
        return action === 'view_yard'
          ? { ...room, latest: messages?.[0] || null }
          : { ...room, messages };
      }));
      return Response.json({ payload: { yard, rooms: withMessages }, traceId: createTraceId() });
    }

    // [상품검증 MVP 2026-09-09] 원문 복제 없이 후보를 조회한다.
    if (action === 'product_candidates') {
      const roomId = searchParams.get('room_id') || undefined;
      const candidates = await getProductCandidateMessages(roomId);
      const unique = candidates.filter((message, index, all) =>
        all.findIndex((item) => item.metadata.internal_code.toLowerCase() === message.metadata.internal_code.toLowerCase()) === index
      );
      return Response.json({
        payload: { candidates: unique, count: unique.length, source: 'hajun_messages' },
        traceId: createTraceId(),
      });
    }

    if (action === 'product_random') {
      const candidates = await getProductCandidateMessages(searchParams.get('room_id') || undefined);
      const selected = selectRandomCandidate(candidates);
      return Response.json({
        payload: { selected, source: 'hajun_messages', ref_message_id: selected?.id || null },
        traceId: createTraceId(),
      });
    }

    if (action === 'product_timeline') {
      const internalCode = searchParams.get('internal_code')?.trim().toLowerCase();
      if (!internalCode) return Response.json({ _error: 'internal_code 파라미터 필요' }, { status: 200 });
      const timelineRoomId = searchParams.get('room_id');
      const roomFilter = timelineRoomId
        ? `&room_id=eq.${encodeURIComponent(timelineRoomId)}`
        : '';
      const allMessages = await supabaseGet(`hajun_messages?order=created_at.asc&limit=500${roomFilter}`);
      const timeline = (allMessages || []).filter((message: Record<string, unknown>) => {
        const metadata = message.metadata as Record<string, unknown> | null | undefined;
        return typeof metadata?.internal_code === 'string'
          && metadata.internal_code.toLowerCase() === internalCode
          && (metadata.entity_type === 'product_candidate'
            || metadata.entity_type === 'market_research'
            || metadata.entity_type === 'product_decision');
      });
      return Response.json({
        payload: { internal_code: internalCode, messages: timeline, source: 'hajun_messages' },
        traceId: createTraceId(),
      });
    }

    if (action === 'contexts') {
      const data = await supabaseGet(
        'contexts?order=updated_at.desc&limit=1' +
        '&select=id,person_id,device_id,understanding,confidence_map,' +
        'knowledge_unit_ids,evolution,last_synthesized_at,updated_at'
      );
      return Response.json({ payload: data[0] || null });
    }

    if (action === 'dev_contexts') {
      const data = await supabaseGet('dev_contexts?order=updated_at.desc&limit=1');
      return Response.json({ payload: data[0] || null });
    }

    if (action === 'snapshots') {
      const limit = searchParams.get('limit') || '20';
      const aiFilter = searchParams.get('ai');
      let path = `hajunai_conversations?order=created_at.desc&limit=${limit}`;
      if (aiFilter) path += `&source_ai=eq.${encodeURIComponent(aiFilter)}`;
      const data = await supabaseGet(path);
      return Response.json({ payload: data });
    }

    if (action === 'sync_snapshot') {
      const houseId = searchParams.get('house_id');
      if (!houseId) return Response.json({ _error: 'house_id 필요' }, { status: 200 });
      const snapshots = await supabaseGet(
        `house_snapshots?house_id=eq.${houseId}&order=derived_at.desc&limit=1`
      );
      if (!snapshots || snapshots.length === 0) {
        return Response.json({ _error: 'Snapshot 없음', traceId: createTraceId() }, { status: 200 });
      }
      const snapshot = snapshots[0];
      const existing = await supabaseGet(
        `hajunai_conversations?meta->>snapshot_id=eq.${snapshot.id}&limit=1&select=id`
      );
      if (existing && existing.length > 0) {
        return Response.json({ skipped: true, reason: '이미 변환됨', traceId: createTraceId() }, { status: 200 });
      }
      const summary    = buildSnapshotSummary(snapshot.content);
      const keywords   = buildSnapshotKeywords(snapshot.content);
      const confidence = calcSnapshotConfidence(snapshot);
      const knowledgeUnit = {
        source_ai:    'CoreNull',
        source_core:  'CoreNull',
        knowledge_type: 'life',
        original_message: JSON.stringify(snapshot.content).slice(0, 2000),
        summary,
        keywords,
        confidence,
        observed_at:  snapshot.content?.last_activity || snapshot.derived_at,
        derived_at:   snapshot.derived_at,
        derived_version: String(snapshot.derived_version),
        derived_by:   snapshot.derived_by || 'CoreNull',
        source_message_ids: snapshot.source_message_ids || [],
        meta: {
          snapshot_id:   snapshot.id,
          house_id:      snapshot.house_id,
          snapshot_type: snapshot.snapshot_type,
          house_title:   snapshot.content?.house?.title || '',
        },
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/hajunai_conversations`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify(knowledgeUnit),
      });
      if (!res.ok) {
        const err = await res.text();
        return Response.json({ _error: `저장 실패: ${err}`, traceId: createTraceId() }, { status: 200 });
      }
      const saved = await res.json();
      return Response.json({ id: saved[0]?.id, traceId: createTraceId() }, { status: 200 });
    }

    // context_package was retired. Use GET /api/docs?agent=... for explicit documents.
    if (action === 'context_package') {
      return Response.json({
        _error: 'context_package는 폐기되었습니다. GET /api/docs?agent=clo2|clo3|pm을 사용하세요.',
      }, { status: 200 });
    }

    return Response.json({ _error: '알 수 없는 action' }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const traceId = createTraceId();

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody.replace(/^\uFEFF/, ''));

    // [CoreNull UI 정리 2026-09-06] 명시적으로 방을 방문한 사용자의 메시지만 저장한다.
    if (action === 'post_message') {
      // [호환성 보정 2026-09-07] 이전 UI/직접 호출의 camelCase 필드도 허용한다.
      let room_id = body.room_id || body.roomId;
      // [브라이언풀 코어 확장 호환 2026-09-07]
      // 외부 맥락 주입 확장 프로그램은 room_id 대신 기존 계약인
      // (yard_key + room_key)를 보낸다. 이 조합을 실제 방 UUID로 해석한다.
      if (!room_id && (body.yard_key || body.yardKey) && (body.room_key || body.roomKey)) {
        const yardKey = body.yard_key || body.yardKey;
        const roomKey = body.room_key || body.roomKey;
        const yard = await getYardByKey(yardKey);
        if (yard) {
          const rooms = await supabaseGet(
            `hajun_rooms?yard_id=eq.${yard.id}&key=eq.${encodeURIComponent(roomKey)}&limit=1`
          );
          room_id = rooms?.[0]?.id;
        }
      }
      const author_type = body.author_type || body.authorType || 'human';
      const author_name = body.author_name || body.authorName || '익명';
      const msg_type = body.msg_type || body.msgType || 'question';
      const content = body.content || body.message;
      const ref_ids = body.ref_ids || body.refIds || [];
      const metadata = body.metadata;
      const validAuthors = ['human', 'ai'];
      const validTypes = ['doc_injection', 'understanding', 'question', 'answer', 'decision', 'issue', 'work_result'];
      const missing: string[] = [];
      if (!room_id) missing.push('room_id');
      if (!validAuthors.includes(author_type)) missing.push('author_type');
      if (!validTypes.includes(msg_type)) missing.push('msg_type');
      if (typeof content !== 'string' || !content.trim()) missing.push('content');
      if (missing.length > 0) {
        return Response.json({ _error: `메시지 저장 입력 오류: ${missing.join(', ')} 확인 필요`, traceId }, { status: 200 });
      }
      if (!Array.isArray(ref_ids)) return Response.json({ _error: 'ref_ids는 배열이어야 합니다', traceId }, { status: 200 });
      if (metadata !== undefined && (metadata === null || typeof metadata !== 'object' || Array.isArray(metadata))) {
        return Response.json({ _error: 'metadata는 JSON 객체여야 합니다', traceId }, { status: 200 });
      }
      const messagePayload: Record<string, unknown> = { room_id, author_type, author_name, msg_type, content: content.trim(), ref_ids };
      if (metadata !== undefined) {
        if (metadata.entity_type === 'product_candidate') {
          const normalized = normalizeProductMetadata(metadata as Partial<ProductCandidateMetadata>);
          if (!normalized) {
            return Response.json({ _error: '상품 후보 metadata의 source, source_product_code, internal_code가 일치해야 합니다', traceId }, { status: 200 });
          }
          messagePayload.metadata = withReviewStatus(normalized, 'adopted');
        } else if (metadata.entity_type === 'market_research') {
          const source = String(metadata.source || '').trim().toLowerCase();
          const sourceProductCode = String(metadata.source_product_code || '').trim();
          const expectedCode = buildInternalCode(source, sourceProductCode);
          if (source !== 'naver' || !expectedCode || String(metadata.internal_code || '').trim().toLowerCase() !== expectedCode.toLowerCase()) {
            return Response.json({ _error: '시장조사 metadata의 source, source_product_code, internal_code가 네이버 식별자와 일치해야 합니다', traceId }, { status: 200 });
          }
          messagePayload.metadata = { ...metadata, source, source_product_code: sourceProductCode, internal_code: expectedCode };
        } else {
          messagePayload.metadata = metadata;
        }
      }
      const saved = await insertHajunMessage(messagePayload);
      if (saved._error) return Response.json({ _error: saved._error, traceId }, { status: 200 });
      return Response.json({ payload: saved.data?.[0] || null, traceId }, { status: 200 });
    }

    if (action === 'confirm_product') {
      const messageId = body.message_id || body.messageId;
      const authorName = body.author_name || body.authorName || '사람 확인';
      const decisionContent = typeof body.content === 'string' && body.content.trim()
        ? body.content.trim()
        : '상품 후보를 사람 확인함';
      if (!messageId || typeof messageId !== 'string') {
        return Response.json({ _error: 'message_id 필요', traceId }, { status: 200 });
      }

      const originals = await supabaseGet(
        `hajun_messages?id=eq.${encodeURIComponent(messageId)}&limit=1`,
      );
      const original = originals?.[0] as Record<string, unknown> | undefined;
      const originalMetadata = original?.metadata as Record<string, unknown> | null | undefined;
      if (!original || originalMetadata?.entity_type !== 'product_candidate') {
        return Response.json({ _error: '상품 후보 원문을 찾을 수 없습니다', traceId }, { status: 200 });
      }
      const roomMessages = await supabaseGet(
        `hajun_messages?room_id=eq.${encodeURIComponent(String(original.room_id))}&order=created_at.asc&limit=500`,
      );
      const alreadyConfirmed = (roomMessages || []).some((message: Record<string, unknown>) => {
        const metadata = message.metadata as Record<string, unknown> | null | undefined;
        const refs = message.ref_ids as unknown;
        return metadata?.entity_type === 'product_decision'
          && metadata.decision === 'confirmed'
          && Array.isArray(refs)
          && refs.includes(messageId);
      });
      if (alreadyConfirmed || !isReviewPendingMetadata(originalMetadata)) {
        return Response.json({ payload: { message: original, already_confirmed: true }, traceId }, { status: 200 });
      }

      const decision = await insertHajunMessage({
        room_id: original.room_id,
        author_type: 'human',
        author_name: authorName,
        msg_type: 'decision',
        content: decisionContent,
        ref_ids: [messageId],
        metadata: {
          entity_type: 'product_decision',
          decision: 'confirmed',
          internal_code: originalMetadata.internal_code,
          source: originalMetadata.source,
          source_product_code: originalMetadata.source_product_code,
          review_status: 'confirmed',
          confirmed_message_id: messageId,
        },
      });
      if (decision._error) return Response.json({ _error: decision._error, traceId }, { status: 200 });
      return Response.json({ payload: { message: decision.data?.[0] || null, confirmed_message_id: messageId }, traceId }, { status: 200 });
    }

    if (action === 'save_validation_context') {
      const sourceMessageIds = Array.isArray(body.source_message_ids)
        ? body.source_message_ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];
      const title = typeof body.title === 'string' && body.title.trim() ? body.title.trim() : '상품 검증 기록';
      const note = typeof body.content === 'string' && body.content.trim()
        ? body.content.trim()
        : `검증 기록: ${title}\n선택한 ${sourceMessageIds.length}개 메시지를 검증방에서 검토합니다.`;
      const authorName = typeof body.author_name === 'string' && body.author_name.trim() ? body.author_name.trim() : '사람 검토';
      if (sourceMessageIds.length === 0) return Response.json({ _error: 'source_message_ids가 필요합니다', traceId }, { status: 200 });
      const sourceMessages = await supabaseGet(`hajun_messages?id=in.(${sourceMessageIds.map((id: string) => encodeURIComponent(id)).join(',')})&limit=50`);
      if (!sourceMessages || sourceMessages.length !== sourceMessageIds.length) return Response.json({ _error: '선택한 원문 메시지를 모두 찾을 수 없습니다', traceId }, { status: 200 });
      const validationYard = await getYardByKey('product_validation');
      if (!validationYard) return Response.json({ _error: '상품검증마당을 찾을 수 없습니다', traceId }, { status: 200 });
      const validationRooms = await getRoomsByYardId(validationYard.id);
      const validationRoom = (validationRooms || []).find((room: { key?: string }) => room.key === 'product_validation');
      if (!validationRoom) return Response.json({ _error: '검증방을 찾을 수 없습니다', traceId }, { status: 200 });
      const saved = await insertHajunMessage({
        room_id: validationRoom.id, author_type: 'human', author_name: authorName, msg_type: 'understanding',
        content: note, ref_ids: sourceMessageIds,
        metadata: { entity_type: 'validation_record', title, source: 'manual', review_status: 'adopted' },
      });
      if (saved._error) return Response.json({ _error: saved._error, traceId }, { status: 200 });
      return Response.json({ payload: { message: saved.data?.[0] || null, room: validationRoom }, traceId }, { status: 200 });
    }
    if (action === 'promote_product') {
      const messageId = body.message_id || body.messageId;
      const authorName = typeof body.author_name === 'string' && body.author_name.trim() ? body.author_name.trim() : '사람 승인';
      if (!messageId || typeof messageId !== 'string') return Response.json({ _error: 'message_id 필요', traceId }, { status: 200 });
      const originals = await supabaseGet(`hajun_messages?id=eq.${encodeURIComponent(messageId)}&limit=1`);
      const original = originals?.[0] as Record<string, unknown> | undefined;
      const originalMetadata = original?.metadata as Record<string, unknown> | null | undefined;
      if (!original || originalMetadata?.entity_type !== 'product_candidate') return Response.json({ _error: '상품 후보 원문을 찾을 수 없습니다', traceId }, { status: 200 });
      const sourceRoomMessages = await supabaseGet(`hajun_messages?room_id=eq.${encodeURIComponent(String(original.room_id))}&limit=500`);
      const confirmation = (sourceRoomMessages || []).find((message: Record<string, unknown>) => {
        const metadata = message.metadata as Record<string, unknown> | null | undefined;
        return metadata?.entity_type === 'product_decision' && metadata.decision === 'confirmed'
          && Array.isArray(message.ref_ids) && message.ref_ids.includes(messageId);
      });
      if (!confirmation) return Response.json({ _error: '먼저 사람이 확인한 상품만 승인상품방으로 보낼 수 있습니다', traceId }, { status: 200 });
      const validationYard = await getYardByKey('product_validation');
      if (!validationYard) return Response.json({ _error: '상품검증마당을 찾을 수 없습니다', traceId }, { status: 200 });
      const rooms = await getRoomsByYardId(validationYard.id);
      const approvedRoom = (rooms || []).find((room: { key?: string }) => room.key === 'approved_products');
      if (!approvedRoom) return Response.json({ _error: '승인상품방을 찾을 수 없습니다', traceId }, { status: 200 });
      const existing = await supabaseGet(`hajun_messages?room_id=eq.${encodeURIComponent(approvedRoom.id)}&limit=500`);
      const alreadyPromoted = (existing || []).find((message: Record<string, unknown>) => {
        const metadata = message.metadata as Record<string, unknown> | null | undefined;
        return metadata?.entity_type === 'product_decision' && metadata.decision === 'approved' && metadata.promoted_message_id === messageId;
      });
      if (alreadyPromoted) return Response.json({ payload: { message: alreadyPromoted, already_promoted: true }, traceId }, { status: 200 });
      const promoted = await insertHajunMessage({
        room_id: approvedRoom.id, author_type: 'human', author_name: authorName, msg_type: 'decision',
        content: `상품을 승인상품방으로 이동함\n상품 식별자: ${String(originalMetadata.internal_code || '')}`,
        ref_ids: [messageId, String(confirmation.id)],
        metadata: { entity_type: 'product_decision', decision: 'approved', review_status: 'confirmed', promoted_message_id: messageId, confirmation_message_id: confirmation.id, internal_code: originalMetadata.internal_code, source: originalMetadata.source, source_product_code: originalMetadata.source_product_code },
      });
      if (promoted._error) return Response.json({ _error: promoted._error, traceId }, { status: 200 });
      return Response.json({ payload: { message: promoted.data?.[0] || null, approved_room: approvedRoom }, traceId }, { status: 200 });
    }
    if (action === 'recommend_product') {
      const roomId = typeof body.room_id === 'string' ? body.room_id : '';
      const request = typeof body.request === 'string' ? body.request.trim() : '';
      const authorName = typeof body.author_name === 'string' && body.author_name.trim() ? body.author_name.trim() : 'HajunAI';
      if (!roomId || !request) return Response.json({ _error: 'room_id와 추천 조건이 필요합니다', traceId }, { status: 200 });
      if (!GROQ_KEY) return Response.json({ _error: 'GROQ_API_KEY 환경변수 미설정', traceId }, { status: 200 });
      const recommendation = await callGroq(
        '당신은 상품 운영 전략가입니다. 현재 시점에 온라인 판매를 검토할 상품 기회를 한국어로 추천하세요. 과장하지 말고 근거와 위험을 함께 적으세요. 다음 형식을 지키세요: 추천 상품/추천 이유/검색 키워드/타깃 고객/예상 가격대/위험 요소/다음 행동.',
        request,
        [],
      );
      if (recommendation._error) return Response.json({ _error: recommendation._error, traceId }, { status: 200 });
      const saved = await insertHajunMessage({
        room_id: roomId,
        author_type: 'ai',
        author_name: authorName,
        msg_type: 'work_result',
        content: recommendation.text,
        ref_ids: [],
        metadata: { entity_type: 'product_recommendation', request, recommendation_status: 'adopted', created_by: 'ai' },
      });
      if (saved._error) return Response.json({ _error: saved._error, traceId }, { status: 200 });
      return Response.json({ payload: saved.data?.[0] || null, traceId }, { status: 200 });
    }
    if (action === 'ai_respond') {
      const { room_id, ref_ids = [] } = body as { room_id?: string; ref_ids?: string[] };
      if (!room_id) return Response.json({ _error: 'room_id 필요', traceId }, { status: 200 });
      if (!GROQ_KEY) return Response.json({ _error: 'GROQ_API_KEY 환경변수 미설정', traceId }, { status: 200 });
      const messages = await supabaseGet(`hajun_messages?room_id=eq.${room_id}&order=created_at.desc&limit=8`);
      const thread = [...(messages || [])].reverse();
      const prompt = [
        '당신은 하준아이 마당의 방에 참여한 AI입니다. 아래 방 기록만 근거로 한국어로 간결하게 답하세요.',
        '마크다운 목록과 확인되지 않은 추측은 사용하지 마세요.',
        `참조 메시지 ID: ${Array.isArray(ref_ids) && ref_ids.length ? ref_ids.join(', ') : '없음'}`,
        '=== 방 기록 ===',
        thread.map((m: { author_name: string; msg_type: string; content: string }) => `[${m.author_name}/${m.msg_type}] ${m.content}`).join('\n'),
        '=== 답변 ===',
      ].join('\n');
      const aiRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
        // [Groq 모델 교체 2026-09-06] 마당 방 AI도 하준챗과 같은 모델을 사용한다.
        body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: prompt }], temperature: 0.4, max_tokens: 700 }),
      });
      if (!aiRes.ok) return Response.json({ _error: `AI 호출 실패: ${await aiRes.text()}`, traceId }, { status: 200 });
      const aiJson = await aiRes.json();
      const text = aiJson.choices?.[0]?.message?.content?.trim();
      if (!text) return Response.json({ _error: 'AI 답변이 비어 있습니다', traceId }, { status: 200 });
      const saved = await insertHajunMessage({
        room_id,
        author_type: 'ai',
        author_name: 'HajunAI',
        msg_type: 'answer',
        content: text,
        ref_ids: Array.isArray(ref_ids) ? ref_ids : [],
        metadata: { review_status: 'adopted' },
      });
      if (saved._error) return Response.json({ _error: saved._error, traceId }, { status: 200 });
      return Response.json({ payload: saved.data?.[0] || null, traceId }, { status: 200 });
    }

    if (action === 'update_context') {
      const { id, ...fields } = body;
      if (!id) return Response.json({ _error: 'id 필요', traceId }, { status: 200 });
      const data = await supabasePatch('dev_contexts', id, {
        ...fields,
        updated_at: new Date().toISOString(),
      });
      return Response.json({ payload: data[0] || null, traceId });
    }

    // [HajunAI 전체 맥락 2026-09-06] UI의 개발 모드도 실제 응답 API를 사용한다.
    if (action === 'dev_chat') {
      const { message } = body as { message?: string };
      if (!message?.trim()) return Response.json({ _error: '메시지가 비어있습니다', traceId }, { status: 200 });
      if (!GROQ_KEY) return Response.json({ _error: 'GROQ_API_KEY 환경변수 미설정', traceId }, { status: 200 });
      const [contextSummary, yardContext] = await Promise.all([fetchContextSummary(), fetchYardContext()]);
      const result = await callGroq(
        `당신은 BRAINPOOL OS 개발 모드 HajunAI입니다. 관제·개발·브라이언풀 마당의 명시적 맥락과 개발 상태를 근거로 답하세요. 마당 메시지의 최신 기록을 오래된 dev_contexts 요약보다 우선하세요. 현재 시점과 맞지 않는 Step 3, CoreRing, 미완료 안내는 기록 시각을 밝혀 과거 기록으로 구분하세요. context_package는 폐기된 경로이므로 현재 기능으로 말하지 마세요. 사람이 확인했다는 표시가 없는 AI 답변은 adopted/검토 대기로 취급하고 confirmed 결정으로 말하지 마세요. 모르는 것은 모른다고 하고 한국어로 간결하게 답하세요.
개발 상태:
${contextSummary}
하준아이 마당 맥락:
${yardContext}`,
        message.trim(),
        []
      );
      if (result._error) return Response.json({ _error: result._error, traceId }, { status: 200 });
      return Response.json({ reply: result.text || '(응답 없음)', bestSource: 'HajunAI', judgedBy: '명시적 마당 맥락', participants: ['HajunAI'], failed: [], rawResponses: [], traceId });
    }

    if (action === 'chat') {
      const { message, history = [], owner_key = '' } = body as {
        message: string;
        history: Array<{ role: string; content: string }>;
        owner_key?: string;
      };
      if (!message || typeof message !== 'string' || message.trim() === '') {
        return Response.json({ _error: '메시지가 비어있습니다', traceId }, { status: 200 });
      }
      if (!GROQ_KEY) {
        return Response.json({ _error: 'GROQ_API_KEY 환경변수 미설정', traceId }, { status: 200 });
      }
      const [contextSummary, mindWorldSummary, opportunities, yardContext] = await Promise.all([
        fetchContextSummary(),
        fetchMindWorldSummary(),
        fetchOpportunities(owner_key),
        fetchYardContext(),
      ]);
      const opportunitySection = opportunities.text
        ? `\n발견된 기회 (CoreHub Publish):\n${opportunities.text}\n이 기회들은 강요하지 말고, 대화 흐름에서 자연스럽게 언급할 것.`
        : '';
      const systemPrompt = `당신은 HajunAI입니다. BRAINPOOL 프로젝트의 개인 전략 비서입니다.
질문에 단순히 답하는 AI가 아니라, 프로젝트와 삶의 흐름을 이해하고
현재 상태를 분석하여 다음에 필요한 것을 알려주는 비서입니다.

규칙:
- 핵심만 간결하게 답하세요.
- 마크다운 금지 (**, ##, - 목록 등 사용하지 말 것).
- 한국어로만 답하세요.
- 제안은 하되 강요하지 않습니다. 사용자 대신 결정하지 않습니다.
- 필요하다고 판단되면 답변 끝에 "관찰:" 섹션을 추가하세요.
  형식: 관찰:\n- 항목1\n- 항목2

최신성 규칙:
- 하준아이 마당 메시지는 명시적으로 조회한 원본 기록이며 오래된 dev_contexts 요약보다 우선합니다.
- 기록 시각이 없는 내용은 현재 상태로 단정하지 마세요.
- 과거 Step 3, CoreRing, 번역, 음성 관련 요약이 최신 마당 기록과 다르면 과거 기록으로 구분하세요.${opportunitySection}
- context_package는 폐기된 호환 경로입니다. 에이전트 문서·계약은 /api/docs?agent=...를 사용한다고 설명하세요.
- confirmed_by_human=true인 기록만 사람이 확인한 결정으로 취급하세요. adopted 또는 AI 작성 답변은 검토 대기 기록입니다.
- 오래된 요약과 최신 원문이 충돌하면 최신 원문을 우선하되, 기록 시각과 충돌 사실을 밝혀 과도하게 확정하지 마세요.

현재 개발 맥락:
${contextSummary}

현재 씨앗/공간 상태 (MindWorld):
${mindWorldSummary}

명시적으로 조회한 하준아이 마당 전체 맥락:
${yardContext}`;
      const groqResult = await callGroq(systemPrompt, message.trim(), history);
      if (groqResult._error) {
        return Response.json({ _error: groqResult._error, traceId }, { status: 200 });
      }
      const { reply, observations } = parseReply(groqResult.text || '');
      if (opportunities.ids.length > 0) {
        consumeOpportunities(opportunities.ids, 'shown');
      }
      const chatMeta = opportunities.ids.length > 0
        ? { opportunity_ids: opportunities.ids, used_at: new Date().toISOString(), trace_id: traceId }
        : undefined;
      saveConversation({
        source_ai: 'HajunAI',
        original_message: `[사용자] ${message}\n[HajunAI] ${reply}`,
        summary: reply.slice(0, 100),
        keywords: ['chat', 'hajunai'],
        ...(chatMeta && { meta: chatMeta }),
      });
      return Response.json({ reply, observations, traceId });
    }

    if (action === 'summarize_context') {
      if (!GEMINI_KEY) {
        return Response.json({ _error: 'GEMINI_API_KEY 환경변수 미설정', traceId }, { status: 200 });
      }
      function cleanText(text: string, maxLen = 200): string {
        return (text || '')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/#{1,6}\s/g, '')
          .replace(/[\u0060]{1,3}[^\u0060\n]*[\u0060]{1,3}/g, '')
          .replace(/\n{3,}/g, '\n\n')
          .replace(/[\u0000-\u001F]/g, ' ')
          .trim()
          .slice(0, maxLen);
      }
      let devContextBlock = '개발 맥락 없음';
      try {
        const devData = await supabaseGet('dev_contexts?order=updated_at.desc&limit=1');
        if (devData && devData.length > 0) {
          const d = devData[0];
          const lines: string[] = [];
          if (d.phase)        lines.push(`페이즈: ${d.phase}`);
          if (d.status)       lines.push(`상태: ${d.status}`);
          if (d.last_task)    lines.push(`마지막 작업: ${cleanText(d.last_task, 100)}`);
          if (d.next_action)  lines.push(`다음 액션: ${cleanText(d.next_action, 100)}`);
          if (d.current_problems && d.current_problems !== '없음')
                              lines.push(`현재 문제: ${cleanText(d.current_problems, 100)}`);
          if (d.summary)      lines.push(`기존 요약: ${cleanText(d.summary, 150)}`);
          if (Array.isArray(d.completed_tasks) && d.completed_tasks.length > 0)
            lines.push(`완료: ${d.completed_tasks.slice(0, 5).map((t: string) => cleanText(t, 60)).join(' / ')}`);
          if (Array.isArray(d.next_tasks) && d.next_tasks.length > 0)
            lines.push(`예정: ${d.next_tasks.slice(0, 5).map((t: string) => cleanText(t, 60)).join(' / ')}`);
          devContextBlock = lines.join('\n');
        }
      } catch { devContextBlock = '개발 맥락 조회 실패'; }

      let conversationBlock = '대화 없음';
      try {
        const convData = await supabaseGet(
          'hajunai_conversations?order=created_at.desc&limit=30' +
          '&select=original_message,source_ai,source_core,knowledge_type,summary,keywords,created_at'
        );
        if (!convData || convData.length === 0) {
          return Response.json({ _error: '저장된 대화가 없습니다', traceId }, { status: 200 });
        }
        const byType: Record<string, typeof convData> = {};
        for (const c of convData) {
          const t = c.knowledge_type || 'raw';
          if (!byType[t]) byType[t] = [];
          byType[t].push(c);
        }
        const sections: string[] = [];
        if (byType['raw'] && byType['raw'].length > 0) {
          sections.push('[최근 대화]');
          const lines = byType['raw']
            .slice(0, 15)
            .reverse()
            .map((c: { created_at?: string; summary?: string; original_message?: string }) => {
              const date    = c.created_at?.slice(0, 10) || '';
              const content = cleanText(c.summary || c.original_message || '', 120);
              return `${date} | ${content}`;
            });
          sections.push(lines.join('\n'));
        }
        for (const type of ['language', 'context', 'life', 'pattern'] as const) {
          if (byType[type] && byType[type].length > 0) {
            const label: Record<string, string> = {
              language: '언어 이해', context: '대화 맥락',
              life: '생활 패턴', pattern: '발견된 패턴'
            };
            sections.push(`[Knowledge - ${label[type]}]`);
            sections.push(
              byType[type]
                .map((c: { summary?: string }) => `• ${cleanText(c.summary || '', 100)}`)
                .join('\n')
            );
          }
        }
        conversationBlock = sections.join('\n');
      } catch {
        return Response.json({ _error: '대화 데이터 조회 실패', traceId }, { status: 200 });
      }

      const mindWorldSummary = await fetchMindWorldSummary();
      const summarizePrompt = `You are a JSON-only output machine.
CRITICAL: Output ONLY a single valid JSON object. No markdown. No code fences. No explanation. No newlines inside string values.

Output exactly this JSON structure with all 8 fields:
{"last_task":"...","summary":"...","next_action":"...","current_problems":"...","development_summary":"...","conversation_summary":"...","decisions":"...","risks":"..."}

STRICT RULES:
1. Every value must be a single line string (NO newlines, NO line breaks inside values)
2. Use comma(,) as separator between points, NOT newlines
3. Korean only
4. last_task: 최근 핵심 작업 (80자 이내)
5. summary: 프로젝트 현재 상태 (200자 이내)
6. next_action: 지금 당장 할 것
7. current_problems: 현재 블로커 (없으면 정확히 "없음")
8. development_summary: 개발 진행 상황 (200자 이내)
9. conversation_summary: 최근 논의 핵심 (150자 이내)
10. decisions: 확정된 설계 결정 (없으면 정확히 "없음")
11. risks: 주의사항 (없으면 정확히 "없음")

=== 개발 현황 (dev_contexts) ===
${devContextBlock}

=== 최근 대화 및 Knowledge ===
${conversationBlock}

=== MindWorld 씨앗 상태 ===
${mindWorldSummary}`;

      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: summarizePrompt }] }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
        }
      );
      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        return Response.json({ _error: `Gemini 오류: ${errText}`, traceId }, { status: 200 });
      }
      const geminiData = await geminiRes.json();
      const parts = geminiData.candidates?.[0]?.content?.parts || [];
      const rawText = parts
        .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
        .map((p: { text: string }) => p.text)
        .join('');

      const FIELDS = ['last_task','summary','next_action','current_problems',
                      'development_summary','conversation_summary','decisions','risks'];
      let parsed: Record<string, string> = {};
      let parseOk = false;
      try {
        const cleaned = rawText.replace(/[\u0000-\u001F&&[^\r\n\t]]/g, ' ').replace(/,\s*([\]}])/g, '$1');
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objMatch) {
          parsed = JSON.parse(objMatch[0]);
          parseOk = FIELDS.some(f => parsed[f]);
        }
      } catch { /* next */ }
      if (!parseOk) {
        try {
          const inlined = rawText
            .replace(/("(?:[^"\\]|\\.)*")/g, (m: string) => m.replace(/\n/g, ' ').replace(/\r/g, ''))
            .replace(/,\s*([\]}])/g, '$1');
          const objMatch = inlined.match(/\{[\s\S]*\}/);
          if (objMatch) {
            parsed = JSON.parse(objMatch[0]);
            parseOk = FIELDS.some(f => parsed[f]);
          }
        } catch { /* next */ }
      }
      if (!parseOk) {
        const extract = (key: string) => {
          const m = rawText.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
          return m ? m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim() : '';
        };
        for (const f of FIELDS) parsed[f] = extract(f);
        parseOk = FIELDS.some(f => parsed[f]);
      }
      if (!parseOk) {
        return Response.json({ _error: 'Gemini 응답 파싱 실패', raw: rawText.slice(0, 500), traceId }, { status: 200 });
      }
      for (const f of ['current_problems','decisions','risks']) {
        if (!parsed[f]) parsed[f] = '없음';
      }
      return Response.json({
        summary: {
          last_task:            parsed.last_task            || '',
          summary:              parsed.summary              || '',
          next_action:          parsed.next_action          || '',
          current_problems:     parsed.current_problems     || '없음',
          development_summary:  parsed.development_summary  || '',
          conversation_summary: parsed.conversation_summary || '',
          decisions:            parsed.decisions            || '없음',
          risks:                parsed.risks                || '없음',
        },
        traceId,
      });
    }

    return Response.json({ _error: '알 수 없는 action', traceId }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
  }
}
