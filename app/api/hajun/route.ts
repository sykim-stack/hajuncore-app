// app/api/hajun/route.ts
// BRAINPOOL 계약: throw 금지, _error 필드 사용, 200/500만
// action: contexts | dev_contexts | snapshots | update_context | chat | summarize_context | sync_snapshot | synthesize_context
// 계약: 원본=Message/Knowledge Unit, contexts=HajunAI 현재 이해, last_synthesized_at=종합 시점
// [CoreNull UI 정리 2026-09-06] 기존 마당·방 View 라우트도 유지한다. 마당은 자동 병합이 아니라 명시적 URL 방문 범위다.

import { supabaseGet, supabasePatch } from '@/lib/supabase';
import { fetchUnderstanding, synthesizeUnderstandingFromKnowledge } from '@/lib/synthesizeUnderstanding';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GEMINI_KEY  = process.env.GEMINI_API_KEY!;
const GROQ_KEY    = process.env.GROQ_API_KEY!;
const HOUSE_ID    = '6341b872-4555-4fdc-8f1d-8009b2b1764f';
const COREHUB_URL = process.env.COREHUB_URL || 'https://brainpool-corehub.vercel.app';

function createTraceId() {
  return 'tr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// NOTE: Full route restored in follow-up. Temporary bootstrap to unbreak deploy.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const traceId = createTraceId();
  try {
    if (action === 'contexts') {
      const data = await supabaseGet(
        'contexts?order=updated_at.desc&limit=1' +
        '&select=id,person_id,device_id,understanding,confidence_map,' +
        'knowledge_unit_ids,evolution,last_synthesized_at,updated_at'
      );
      return Response.json({ payload: data[0] || null, traceId });
    }
    if (action === 'dev_contexts') {
      const data = await supabaseGet('dev_contexts?order=updated_at.desc&limit=1');
      return Response.json({ payload: data[0] || null, traceId });
    }
    return Response.json({ _error: 'route bootstrap — full restore pending: ' + (action || 'none'), traceId }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const traceId = createTraceId();
  try {
    if (action === 'synthesize_context') {
      const result = await synthesizeUnderstandingFromKnowledge();
      if (result._error) return Response.json({ _error: result._error, traceId }, { status: 200 });
      return Response.json({ payload: result, traceId }, { status: 200 });
    }
    return Response.json({ _error: 'route bootstrap — full restore pending: ' + (action || 'none'), traceId }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
  }
}
