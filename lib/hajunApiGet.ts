// lib/hajunApiGet.ts
import {
  createTraceId,
  getYardByKey,
  getRoomsByYardId,
  getProductMessages,
  groupProductCandidates,
  buildSnapshotSummary,
  buildSnapshotKeywords,
  calcSnapshotConfidence,
  SUPABASE_URL,
  SUPABASE_KEY,
  synthesizeUnderstandingFromKnowledge,
  supabaseGet,
} from '@/lib/hajunApiCore';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    if (action === 'yard_list') {
      const payload = await supabaseGet('hajun_yards?order=created_at.asc');
      return Response.json({ payload, traceId: createTraceId() });
    }

    if (action === 'product_candidates') {
      const messages = await getProductMessages();
      if (messages?._error) return Response.json({ _error: messages._error, traceId: createTraceId() }, { status: 200 });
      const candidates = groupProductCandidates((messages || []) as Array<Record<string, unknown>>);
      return Response.json({ payload: { candidates, count: candidates.length, source: 'hajun_messages' }, traceId: createTraceId() });
    }

    if (action === 'product_random') {
      const messages = await getProductMessages();
      if (messages?._error) return Response.json({ _error: messages._error, traceId: createTraceId() }, { status: 200 });
      const candidates = groupProductCandidates((messages || []) as Array<Record<string, unknown>>);
      const selected = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : null;
      return Response.json({ payload: { selected, source: 'hajun_messages', ref_message_id: selected?.id || null }, traceId: createTraceId() });
    }

    if (action === 'product_timeline') {
      const internalCode = searchParams.get('internal_code');
      if (!internalCode) return Response.json({ _error: 'internal_code 필요', traceId: createTraceId() }, { status: 200 });
      const messages = await getProductMessages(internalCode);
      if (messages?._error) return Response.json({ _error: messages._error, traceId: createTraceId() }, { status: 200 });
      return Response.json({ payload: { internal_code: internalCode, messages: messages || [], source: 'hajun_messages' }, traceId: createTraceId() });
    }

    // 상품등록마당: 열린 listing_draft 대기열
    if (action === 'listing_queue') {
      const path =
        'hajun_messages?metadata->>entity_type=eq.listing_draft' +
        '&metadata->>status=neq.published&order=created_at.desc';
      const messages = await supabaseGet(path);
      if (messages?._error) {
        return Response.json({ _error: messages._error, traceId: createTraceId() }, { status: 200 });
      }
      return Response.json({
        payload: { items: messages || [], count: (messages || []).length, source: 'hajun_messages' },
        traceId: createTraceId(),
      });
    }

    // 상품등록마당: internal_code 기준 listing 이력
    if (action === 'listing_timeline') {
      const internalCode = searchParams.get('internal_code');
      if (!internalCode) {
        return Response.json({ _error: 'internal_code 필요', traceId: createTraceId() }, { status: 200 });
      }
      const path =
        `hajun_messages?metadata->>internal_code=eq.${encodeURIComponent(internalCode)}` +
        `&metadata->>entity_type=in.(listing_draft,listing_content,listing_published)` +
        `&order=created_at.asc`;
      const messages = await supabaseGet(path);
      if (messages?._error) {
        return Response.json({ _error: messages._error, traceId: createTraceId() }, { status: 200 });
      }
      return Response.json({
        payload: { internal_code: internalCode, messages: messages || [], source: 'hajun_messages' },
        traceId: createTraceId(),
      });
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
      let synthesize: Record<string, unknown> | null = null;
      try {
        synthesize = await synthesizeUnderstandingFromKnowledge();
      } catch (e) {
        synthesize = { _error: e instanceof Error ? e.message : String(e) };
      }
      return Response.json({
        id: saved[0]?.id,
        synthesize,
        traceId: createTraceId(),
      }, { status: 200 });
    }

    if (action === 'context_package') {
      return Response.json({
        _error: 'context_package는 폐기되었습니다. GET /api/docs?agent=... 를 사용하세요.',
        traceId: createTraceId(),
      }, { status: 200 });
    }

    return Response.json({ _error: `알 수 없는 action: ${action}`, traceId: createTraceId() }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId: createTraceId() }, { status: 500 });
  }
}
