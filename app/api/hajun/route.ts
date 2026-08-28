// app/api/hajun/route.ts
// BRAINPOOL 계약: throw 금지, _error 필드 사용, 200/500만
// action: contexts | dev_contexts | snapshots | update_context | chat | summarize_context | context_package
// 채팅: Groq (openai/gpt-oss-120b) / 요약: Gemini 2.5 Flash
//
// v1.1 변경사항:
// - GET  contexts      → 사람 이해용 contexts (understanding 등 새 구조)
// - GET  dev_contexts  → 개발 핸드오프 (구 contexts 역할, 신규)
// - POST update_context → dev_contexts 패치로 라우팅 (하위 호환 유지)
// - fetchContextSummary() → dev_contexts 읽도록 변경
//
// v1.2 변경사항:
// - context_package → /api/docs?agent=claude2 에서 plain text로 받은 문서를
//   그대로 주입하고, dev_contexts의 last_task/current_problems/next_action 만 포함

import { supabaseGet, supabasePatch } from '@/lib/supabase';
import { fetchLanguageKnowledge, buildLanguageKnowledgeBlock } from '@/lib/languageKnowledge';
import {
  looksLikeCompletion,
  summarizeWorkLog,
  saveWorkLog,
  fetchRecentWorkLogs,
  buildWorkLogBlock,
} from '@/lib/workLog';
import { fetchContextSummary, fetchMindWorldSummary } from '@/lib/context';
import { callGroq } from '@/lib/groq';
import { runDevChat } from '@/lib/devAiPanel';
import { buildRoomContextPackage, type EngineRoom } from '@/lib/hajunRooms';
import { GROUND_TRUTH_BLOCK } from '@/lib/groundTruth';
export const maxDuration = 30; // Hobby 플랜 기본 10초 → 30초로 확보 (직렬 전환 대비)

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;
const GEMINI_KEY  = process.env.GEMINI_API_KEY!;
const GROQ_KEY    = process.env.GROQ_API_KEY!;
const HOUSE_ID    = '6341b872-4555-4fdc-8f1d-8009b2b1764f';
const COREHUB_URL = process.env.COREHUB_URL || 'https://brainpool-corehub.vercel.app';

function createTraceId() {
  return 'tr-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

// ── Step 3: Snapshot 변환 헬퍼 ────────────────────────────────
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

// ── CoreHub Opportunity 조회 (v1.2) ──────────────────────────
// CoreHub Architecture v2.0: Publish된 Public Knowledge를 HajunAI가 소비
async function fetchOpportunities(ownerKey: string): Promise<{
  text: string;
  ids: string[];
}> {
  if (!ownerKey) return { text: '', ids: [] };
  try {
    const res = await fetch(
      `${COREHUB_URL}/api/corehub/opportunities?owner_key=${encodeURIComponent(ownerKey)}`,
      {
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(3000), // CoreHub가 멈춰있어도 3초면 포기
      }
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

// ── chat action 본문 (Promise.all → 직렬 전환) ────────────────
// action === 'chat' 블록 안, 기존 Promise.all 부분만 아래로 교체
/*
      const trimmedMessage = message.trim();

      // v1.3: 병렬 → 직렬. 커넥션 부하를 줄이고, 어느 단계에서 느려지는지
      // 나중에 로그로 특정하기 쉽게 한다. 각 함수는 fail-soft(catch로 감싸짐)라
      // 하나가 느려져도 최소한 timeout까지만 기다리고 다음으로 넘어간다.
      const contextSummary = await fetchContextSummary();
      const mindWorldSummary = await fetchMindWorldSummary();
      const opportunities = await fetchOpportunities(owner_key);
      const languageKnowledgeItems = await fetchLanguageKnowledge({ text: trimmedMessage, limit: 3 });
      const recentWorkLogs = await fetchRecentWorkLogs(5);
*/

// ── Opportunity 소비 처리 ────────────────────────────────────
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
  } catch { /* 소비 실패해도 응답은 반환 */ }
}


// ── 대화 저장 ─────────────────────────────────────────────────
async function saveConversation(payload: {
  source_ai: string;
  original_message: string;
  summary: string;
  keywords: string[];
  meta?: Record<string, unknown>;
}): Promise<void> {
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
  } catch { /* 저장 실패해도 응답은 반환 */ }
}

type ConversationEvent = {
  id?: string;
  source_ai?: string;
  original_message?: string;
  created_at?: string;
};

// 최근 개발·관제 채팅 원문을 다음 관제 요청의 Context View로 읽는다.
// DB 원문은 그대로 보존하며, 현재 답변의 Context View에는 각 사건의 사람 원문만 넣는다.
async function fetchRecentConversationEvents(limit = 3): Promise<ConversationEvent[]> {
  const data = await supabaseGet(
    `hajunai_conversations?source_ai=in.(HajunAI,HajunAI-DevChat)&order=created_at.desc&limit=${limit}` +
    '&select=id,source_ai,original_message,created_at'
  );
  return Array.isArray(data) ? data as ConversationEvent[] : [];
}

// 각 원문 사건에서 사람 발화 구간만 꺼낸다. AI 답변·오류 원문은 DB 사건에 보존하되,
// 새 답변의 지시 재료로 자동 주입하지 않는다.
function extractConversationUserMessage(raw: string): string {
  const chatPrefix = '[사용자] ';
  const chatStart = raw.indexOf(chatPrefix);
  if (chatStart !== -1) {
    const start = chatStart + chatPrefix.length;
    const aiIndex = raw.indexOf('\n[HajunAI]', start);
    const errorIndex = raw.indexOf('\n[HajunAI 오류]', start);
    const end = [aiIndex, errorIndex].filter((index) => index !== -1).sort((a, b) => a - b)[0];
    return raw.slice(start, end === undefined ? undefined : end).trim();
  }

  const devPrefix = '[개발 채팅 질문]\n';
  const devStart = raw.indexOf(devPrefix);
  if (devStart !== -1) {
    const start = devStart + devPrefix.length;
    const end = raw.indexOf('\n\n[AI 응답·오류 원문]', start);
    return raw.slice(start, end === -1 ? undefined : end).trim();
  }

  const legacyPrefix = '[개발질문] ';
  const legacyStart = raw.indexOf(legacyPrefix);
  if (legacyStart !== -1) {
    const start = legacyStart + legacyPrefix.length;
    const end = raw.indexOf('\n[취합답변:', start);
    return raw.slice(start, end === -1 ? undefined : end).trim();
  }

  return raw.trim();
}

function buildConversationEventBlock(events: ConversationEvent[]): string {
  if (events.length === 0) return '이전 대화의 사람 원문 없음';

  return events
    .slice()
    .reverse()
    .map((event) => {
      const id = event.id || 'id 없음';
      const source = event.source_ai || '출처 없음';
      const when = event.created_at || '시각 없음';
      const userMessage = extractConversationUserMessage(event.original_message || '');
      return `[이전 사람 원문 | ${source} | ${when} | ${id}]\n${userMessage || '(사람 원문 없음)'}`;
    })
    .join('\n\n');
}

// ── Observations 파싱 ─────────────────────────────────────────
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

// ═══════════════════════════════════════════════════════════════
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    // 사람 이해용 contexts (v1.1 재정의 — understanding, confidence_map 등)
    if (action === 'contexts') {
      const data = await supabaseGet(
        'contexts?order=updated_at.desc&limit=1' +
        '&select=id,person_id,device_id,understanding,confidence_map,' +
        'knowledge_unit_ids,evolution,last_synthesized_at,updated_at'
      );
      return Response.json({ payload: data[0] || null });
    }
    

    // 개발 핸드오프 — dev_contexts (구 contexts 역할, v1.1 신규)
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

    // Step 3: house_snapshot → Knowledge Unit 변환 트리거
    if (action === 'sync_snapshot') {
      const houseId = searchParams.get('house_id');
      if (!houseId) return Response.json({ _error: 'house_id 필요' }, { status: 200 });

      // 중복 방지: 최신 snapshot_id 확인
      const snapshots = await supabaseGet(
        `house_snapshots?house_id=eq.${houseId}&order=derived_at.desc&limit=1`
      );
      if (!snapshots || snapshots.length === 0) {
        return Response.json({ _error: 'Snapshot 없음', traceId: createTraceId() }, { status: 200 });
      }
      const snapshot = snapshots[0];

      // 이미 변환된 것 스킵
      const existing = await supabaseGet(
        `hajunai_conversations?meta->>snapshot_id=eq.${snapshot.id}&limit=1&select=id`
      );
      if (existing && existing.length > 0) {
        return Response.json({ skipped: true, reason: '이미 변환됨', traceId: createTraceId() }, { status: 200 });
      }

      // Knowledge Unit 변환
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

    // ── context_package: 세션 시작 시 완전한 맥락 패키지 ────
    // 변경: /api/docs?agent=claude2 에서 plain text로 받아 주입
    if (action === 'context_package') {
      const agent = searchParams.get('agent') || 'claude2';
      const DOCS_URL = `https://hajuncore-app.vercel.app/api/docs?agent=${agent}`;

      const [docsContent, devCtxData, knowledgeData] = await Promise.all([
        // 1. GitHub 최신 지시서 + DEV_CONTEXT_SUMMARY (실시간 fetch, plain text)
        fetch(DOCS_URL, { cache: 'no-store' })
          .then(r => r.text())
          .catch(() => "문서 로드 실패"),
        // 2. DB 개발 현황
        supabaseGet('dev_contexts?order=updated_at.desc&limit=1'),
        // 3. 최근 Knowledge Units (raw 제외)
        supabaseGet('hajunai_conversations?order=created_at.desc&limit=10&knowledge_type=neq.raw'),
      ]);

      const devCtx = devCtxData?.[0] || {};

      // 최종 주입 프롬프트 구성
      const injectionPrompt = `당신은 BRAINPOOL OS 에이전트입니다.

${docsContent}

=== ADDITIONAL DB CONTEXT ===
마지막 작업: ${devCtx.last_task || '없음'}
현재 문제: ${devCtx.current_problems || '없음'}
다음 액션: ${devCtx.next_action || '없음'}

위 맥락을 완전히 이해하고 BRAINPOOL 철학에 따라 작업을 이어가세요.`;

      return Response.json({
        agent: agent,
        injection_prompt: injectionPrompt,
        raw: {
          dev_ctx: devCtx,
          knowledge_count: knowledgeData?.length || 0
        }
      });
    }
// ── room_context: Room Context Package 4단계 ──────────────
    // GET /api/hajun?action=room_context&room=CoreNull&limit=20
    // hajun_posts를 원본으로 읽어 방별 Context View(가공본)를 반환한다. 저장하지 않는다.
    if (action === 'room_context') {
      const roomParam = searchParams.get('room') as EngineRoom | null;
      const validRooms: EngineRoom[] = ['CoreNull', 'CoreChat', 'CoreRing', 'CoreHub', 'Hajun'];

      if (!roomParam || !validRooms.includes(roomParam)) {
        return Response.json(
          { _error: 'room 파라미터 필요 (CoreNull|CoreChat|CoreRing|CoreHub|Hajun)', traceId: createTraceId() },
          { status: 200 }
        );
      }

      const limitParam = searchParams.get('limit');
      const limit = limitParam ? Number(limitParam) : undefined;

      const pkg = await buildRoomContextPackage(roomParam, { limit });

      if ('_error' in pkg) {
        return Response.json({ _error: pkg._error, traceId: createTraceId() }, { status: 200 });
      }

      return Response.json({ ...pkg, traceId: createTraceId() });
    }

    return Response.json({ _error: '알 수 없는 action' }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg }, { status: 500 });
  }
}

// ═══════════════════════════════════════════════════════════════
export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const traceId = createTraceId();

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody.replace(/^\uFEFF/, ''));

    // ── update_context → dev_contexts 패치 (하위 호환 유지) ───
    if (action === 'update_dev_context') {
      const { id, ...fields } = body;
      if (!id) return Response.json({ _error: 'id 필요', traceId }, { status: 200 });
      const data = await supabasePatch('dev_contexts', id, {
        ...fields,
        updated_at: new Date().toISOString(),
      });
      return Response.json({ payload: data[0] || null, traceId });
    }

   // ── chat (Groq) ────────────────────────────────────────────
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

      const trimmedMessage = message.trim();

      // CoreHub + Language Knowledge + Work Log 병렬 조회
      const [contextSummary, mindWorldSummary, opportunities, languageKnowledgeItems, recentWorkLogs, recentConversationEvents] =
        await Promise.all([
          fetchContextSummary(),
          fetchMindWorldSummary(),
          fetchOpportunities(owner_key),
          fetchLanguageKnowledge({ text: trimmedMessage, limit: 3 }),
          fetchRecentWorkLogs(5),
          fetchRecentConversationEvents(),
        ]);
      const conversationEventBlock = buildConversationEventBlock(recentConversationEvents);

      // 완료 신호 감지 — 키워드 통과 시에만 Gemini 2차 확인 (비용 절약)
      let workLogSaveNote = '';
      if (looksLikeCompletion(trimmedMessage)) {
        const workLogResult = await summarizeWorkLog(history, trimmedMessage);
        if (workLogResult.isCompletion && workLogResult.entry) {
          const saved = await saveWorkLog(workLogResult.entry);
          if (!saved._error) {
            workLogSaveNote = `\n\n[시스템 알림] 방금 사용자의 메시지를 작업 완료 기록으로 저장했습니다.
제목: ${workLogResult.entry.title}
요약: ${workLogResult.entry.summary}${workLogResult.entry.issues ? `\n미해결: ${workLogResult.entry.issues}` : ''}${workLogResult.entry.next_steps ? `\n다음: ${workLogResult.entry.next_steps}` : ''}
사용자에게 자연스럽게 저장 완료를 알리고, 미해결 사항이나 다음 단계가 있으면 짚어주세요.`;
          }
        }
      }

      // Opportunity 섹션
      const opportunitySection = opportunities.text
        ? `\n발견된 기회 (CoreHub Publish):\n${opportunities.text}\n이 기회들은 강요하지 말고, 대화 흐름에서 자연스럽게 언급할 것.`
        : '';

      // Language Knowledge 섹션
      const languageKnowledgeSection = languageKnowledgeItems.length > 0
        ? `\n관련 언어 지식 (CoreRing Language Knowledge, 참고용 — 강요하지 말 것):\n${buildLanguageKnowledgeBlock(languageKnowledgeItems)}`
        : '';

      // Work Log 섹션 — 항상 포함 (남은 작업/오류 질문에 답하기 위함)
      const workLogSection = `\n\n최근 작업 기록:\n${buildWorkLogBlock(recentWorkLogs)}`;

      const systemPrompt = `당신은 HajunAI입니다. BRAINPOOL 프로젝트의 개인 전략 비서입니다.
질문에 단순히 답하는 AI가 아니라, 프로젝트와 삶의 흐름을 이해하고
현재 상태를 분석하여 다음에 필요한 것을 알려주는 비서입니다.

규칙:
- 핵심만 간결하게 답하세요.
- 마크다운 금지 (**, ##, - 목록 등 사용하지 말 것).
- 한국어로만 답하세요.
- 제안은 하되 강요하지 않습니다. 사용자 대신 결정하지 않습니다.
- 현재 사람 메시지는 가장 최근의 원문 사건입니다. 상태·관찰·완료 보고에는 그 원문을 먼저 반영하세요.
- 현재 사람이 한 상태 보고는 시스템 맥락에 없더라도 명확한 대화 사건입니다. 사실로 확정하거나 검증됐다고 선언하지 말고, "사용자가 이렇게 보고했다"는 형태로 그 내용을 반영하세요.
- "이 정보는 현재 맥락에 없습니다"는 현재 사람 원문 자체가 없거나, 사람이 외부 사실의 검증을 요청했는데 근거가 없을 때만 사용하세요. 현재 사람이 직접 보고한 내용을 이 표현으로 거부하지 마세요.
- 현재 사람 메시지와 오래된 개발 맥락·작업 기록·이전 원문이 다르면, 어느 쪽도 정답으로 바꾸지 말고 출처와 시간의 차이로만 구분하세요. 오래된 계획으로 현재 사람 메시지를 대체하지 마세요.
- 필요하다고 판단되면 답변 끝에 "관찰:" 섹션을 추가하세요.
  형식: 관찰:\n- 항목1\n- 항목2${opportunitySection}${languageKnowledgeSection}

현재 개발 맥락:
${contextSummary}

현재 씨앗/공간 상태 (MindWorld):
${mindWorldSummary}${workLogSection}${workLogSaveNote}

이전 대화의 사람 원문 (Context View — 원문을 바꾸거나 정답·결정·지시로 취급하지 말 것):
${conversationEventBlock}`;

      const groqResult = await callGroq(systemPrompt, trimmedMessage, history);
      if (groqResult._error) {
        await saveConversation({
          source_ai: 'HajunAI',
          original_message: `[사용자] ${message}\n[HajunAI 오류] ${groqResult._error}`,
          summary: groqResult._error.slice(0, 100),
          keywords: ['chat', 'hajunai', 'error'],
          meta: { trace_id: traceId, event_kind: 'chat_error' },
        });
        return Response.json({ _error: groqResult._error, traceId }, { status: 200 });
      }

      const { reply, observations } = parseReply(groqResult.text || '');

      if (opportunities.ids.length > 0) {
        consumeOpportunities(opportunities.ids, 'shown');
      }

      const chatMeta = opportunities.ids.length > 0
        ? { opportunity_ids: opportunities.ids, used_at: new Date().toISOString(), trace_id: traceId }
        : undefined;

      await saveConversation({
        source_ai: 'HajunAI',
        original_message: `[사용자] ${message}\n[HajunAI] ${reply}`,
        summary: reply.slice(0, 100),
        keywords: ['chat', 'hajunai'],
        meta: { trace_id: traceId, event_kind: 'chat_round', ...(chatMeta || {}) },
      });

      return Response.json({ reply, observations, traceId });
    }
        // ── dev_chat (NVIDIA 3모델 + 관제 하준아이 취합, hajun_rooms/posts 저장) ──
    if (action === 'dev_chat') {
      const { message } = body as { message: string };
      if (!message || typeof message !== 'string' || message.trim() === '') {
        return Response.json({ _error: '메시지가 비어있습니다', traceId }, { status: 200 });
      }

      const result = await runDevChat(message.trim(), traceId);

      return Response.json({
        reply: result.finalAnswer,
        bestSource: result.bestSource,
        judgedBy: result.judgedBy,
        participants: result.participants,
        failed: result.failed,
        codeMode: result.codeMode,
        rawResponses: result.rawResponses,
        traceId,
      });
    }

    // ── summarize_context (Gemini 2.5 Flash) ──────────────────
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
            .map((c: { created_at?: string; source_ai?: string; original_message?: string; summary?: string }) => {
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
                .map((c: { summary?: string; keywords?: string[] }) =>
                  `• ${cleanText(c.summary || '', 100)}`
                )
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
6. next_action: 지금 당장 할 것 (예: "구현: CoreHub API - /api/corehub")
7. current_problems: 현재 블로커 (없으면 정확히 "없음")
8. development_summary: 개발 진행 상황 (완료+진행, 200자 이내)
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

      // 1단계: 직접 파싱
      try {
        const cleaned = rawText
          .replace(/[\u0000-\u001F&&[^\r\n\t]]/g, ' ')
          .replace(/,\s*([\]}])/g, '$1');
        const objMatch = cleaned.match(/\{[\s\S]*\}/);
        if (objMatch) {
          parsed = JSON.parse(objMatch[0]);
          parseOk = FIELDS.some(f => parsed[f]);
        }
      } catch { /* 2단계로 */ }

      // 2단계: 줄바꿈 → 공백 치환 후 파싱
      if (!parseOk) {
        try {
          const inlined = rawText
            .replace(/("(?:[^"\\]|\\.)*")/g, (m: string) =>
              m.replace(/\n/g, ' ').replace(/\r/g, '')
            )
            .replace(/,\s*([\]}])/g, '$1');
          const objMatch = inlined.match(/\{[\s\S]*\}/);
          if (objMatch) {
            parsed = JSON.parse(objMatch[0]);
            parseOk = FIELDS.some(f => parsed[f]);
          }
        } catch { /* 3단계로 */ }
      }

      // 3단계: 필드별 정규식 추출
      if (!parseOk) {
        const extract = (key: string) => {
          const m = rawText.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
          return m ? m[1].replace(/\\n/g, ' ').replace(/\\"/g, '"').trim() : '';
        };
        for (const f of FIELDS) parsed[f] = extract(f);
        parseOk = FIELDS.some(f => parsed[f]);
      }

      // 4단계: 전부 실패
      if (!parseOk) {
        return Response.json({
          _error: 'Gemini 응답 파싱 실패',
          raw: rawText.slice(0, 500),
          traceId
        }, { status: 200 });
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