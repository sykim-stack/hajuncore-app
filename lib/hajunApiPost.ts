// lib/hajunApiPost.ts
import {
  createTraceId,
  getRoomByKeys,
  isProductMetadata,
  insertHajunMessage,
  fetchMindWorldSummary,
  fetchOpportunities,
  consumeOpportunities,
  fetchContextSummary,
  saveConversation,
  callGroq,
  parseReply,
  GROQ_KEY,
  GROQ_MODEL,
  GEMINI_KEY,
  NVIDIA_KEY,
  NVIDIA_MODEL,
  NVIDIA_BASE,
  SUPABASE_URL,
  SUPABASE_KEY,
  fetchUnderstanding,
  synthesizeUnderstandingFromKnowledge,
  supabaseGet,
  supabasePatch,
  getProductMessages,
} from '@/lib/hajunApiCore';

async function callListingAI(
  prompt: string,
  opts?: { temperature?: number; max_tokens?: number }
): Promise<{ text?: string; provider?: string; _error?: string }> {
  const errors: string[] = [];
  const temperature = opts?.temperature ?? 0.4;
  const max_tokens = opts?.max_tokens ?? 700;

  if (NVIDIA_KEY) {
    const nvidiaModels = Array.from(new Set([
      NVIDIA_MODEL,
      'meta/llama-3.3-70b-instruct',
      'meta/llama-3.1-70b-instruct',
      'google/gemma-2-9b-it',
    ].filter(Boolean)));
    for (const model of nvidiaModels) {
      try {
        const res = await fetch(`${NVIDIA_BASE.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${NVIDIA_KEY}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens,
            stream: false,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          const text = (data.choices?.[0]?.message?.content || '').trim();
          if (text) return { text, provider: `nvidia:${model}` };
          errors.push(`NVIDIA(${model}): empty`);
        } else {
          const err = (await res.text()).slice(0, 120);
          errors.push(`NVIDIA(${model}): ${err}`);
        }
      } catch (e) {
        errors.push(`NVIDIA(${model}): ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    errors.push('NVIDIA_API_KEY 미설정');
  }

  if (GROQ_KEY) {
    const candidates = [
      GROQ_MODEL,
      'llama-3.1-8b-instant',
      'openai/gpt-oss-20b',
      'openai/gpt-oss-120b',
      'qwen/qwen3-32b',
      'llama-3.3-70b-versatile',
    ].filter(Boolean) as string[];
    const tried = new Set<string>();
    for (const model of candidates) {
      if (tried.has(model)) continue;
      tried.add(model);
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature,
            max_tokens,
          }),
        });
        if (!res.ok) {
          errors.push(`${model}: ${(await res.text()).slice(0, 120)}`);
          continue;
        }
        const data = await res.json();
        const text = (data.choices?.[0]?.message?.content || '').trim();
        if (text) return { text, provider: `groq:${model}` };
        errors.push(`${model}: empty`);
      } catch (e) {
        errors.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  if (GEMINI_KEY) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { temperature, maxOutputTokens: max_tokens },
          }),
        }
      );
      if (res.ok) {
        const data = await res.json();
        const parts = data.candidates?.[0]?.content?.parts || [];
        const text = parts
          .filter((p: { thought?: boolean; text?: string }) => !p.thought && typeof p.text === 'string')
          .map((p: { text: string }) => p.text)
          .join('')
          .trim();
        if (text) return { text, provider: 'gemini:gemini-2.5-flash' };
        errors.push('Gemini: empty');
      } else {
        errors.push(`Gemini: ${(await res.text()).slice(0, 120)}`);
      }
    } catch (e) {
      errors.push(`Gemini: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { _error: errors.slice(0, 4).join(' | ') || 'AI 호출 실패' };
}

function buildHeuristicTitles(samples: Array<{ content?: string; metadata?: Record<string, unknown> | null }>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s: string) => {
    const t = s.replace(/\s+/g, ' ').trim();
    if (t.length < 4 || t.length > 60) return;
    if (seen.has(t)) return;
    seen.add(t);
    out.push(t);
  };
  for (const m of samples) {
    const name = typeof m.metadata?.name === 'string' ? m.metadata.name : '';
    if (name) {
      push(name);
      push(name.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').trim());
    }
    const content = m.content || '';
    const fromLine = content.match(/제품명\s*\n([^\n]+)/)?.[1]
      || content.match(/상품명\s*[:：]?\s*([^\n]+)/)?.[1]
      || content.split('\n').find((l) => l.trim().length > 8 && l.trim().length < 50);
    if (fromLine) push(fromLine);
  }
  return out.slice(0, 5);
}

async function ensureListingDraftFromPass(params: {
  decisionMessage: Record<string, unknown>;
  ref_ids: string[];
  safeMetadata: Record<string, unknown>;
}) {
  const { decisionMessage, ref_ids, safeMetadata } = params;
  const internalCode = typeof safeMetadata.internal_code === 'string' ? safeMetadata.internal_code : '';
  if (!internalCode) return null;

  const existing = await supabaseGet(
    `hajun_messages?metadata->>entity_type=eq.listing_draft` +
      `&metadata->>internal_code=eq.${encodeURIComponent(internalCode)}` +
      `&metadata->>status=neq.published` +
      `&order=created_at.desc&limit=1`
  );
  if (existing?._error) return null;
  if (Array.isArray(existing) && existing.length > 0) return existing[0];

  const listingRoom = await getRoomByKeys('product_listing', 'listing_queue');
  if ('_error' in listingRoom) return null;

  const decisionId = typeof decisionMessage.id === 'string' ? decisionMessage.id : '';
  const draftRefs = Array.from(
    new Set([decisionId, ...(Array.isArray(ref_ids) ? ref_ids : [])].filter(Boolean))
  );

  const draftSaved = await insertHajunMessage({
    room_id: listingRoom.room.id,
    author_type: 'ai',
    author_name: 'HajunAI',
    msg_type: 'work_result',
    content: `검증 통과 → 등록대기 진입: ${internalCode}`,
    ref_ids: draftRefs,
    metadata: {
      entity_type: 'listing_draft',
      internal_code: internalCode,
      status: 'draft',
      title_draft: null,
      thumbnail_status: 'pending',
      detail_status: 'pending',
      target_malls: [],
      source_decision_id: decisionId || null,
    },
  });
  if (draftSaved._error) return null;
  return draftSaved.data?.[0] || null;
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  const traceId = createTraceId();

  try {
    const rawBody = await req.text();
    const body = JSON.parse(rawBody.replace(/^\uFEFF/, ''));

    if (action === 'post_message') {
      let { room_id, author_type, author_name, msg_type, content, ref_ids = [], metadata, yard_key, room_key } = body as {
        room_id?: string; yard_key?: string; room_key?: string; author_type?: string; author_name?: string;
        msg_type?: string; content?: string; ref_ids?: string[]; metadata?: Record<string, unknown>;
      };
      if (!room_id && yard_key && room_key) {
        const resolved = await getRoomByKeys(yard_key, room_key);
        if ('_error' in resolved) return Response.json({ _error: resolved._error, traceId }, { status: 200 });
        room_id = resolved.room.id;
      }
      const validAuthors = ['human', 'ai'];
      const validTypes = ['doc_injection', 'understanding', 'question', 'answer', 'decision', 'issue', 'work_result'];
      if (!room_id || !author_type || !validAuthors.includes(author_type) || !author_name || !msg_type || !validTypes.includes(msg_type) || !content?.trim()) {
        return Response.json({ _error: 'room_id, author_type, author_name, msg_type, content가 필요합니다', traceId }, { status: 200 });
      }
      if (!Array.isArray(ref_ids)) return Response.json({ _error: 'ref_ids는 배열이어야 합니다', traceId }, { status: 200 });
      const safeMetadata = isProductMetadata(metadata) ? metadata : undefined;
      const saved = await insertHajunMessage({
        room_id, author_type, author_name, msg_type, content: content.trim(), ref_ids,
        ...(safeMetadata ? { metadata: safeMetadata } : {}),
      });
      if (saved._error) return Response.json({ _error: saved._error, traceId }, { status: 200 });

      const savedMessage = (saved.data?.[0] || null) as Record<string, unknown> | null;
      let listingDraft: Record<string, unknown> | null = null;

      if (
        savedMessage &&
        msg_type === 'decision' &&
        safeMetadata?.entity_type === 'product_validation_decision' &&
        safeMetadata?.decision === 'pass'
      ) {
        listingDraft = await ensureListingDraftFromPass({
          decisionMessage: savedMessage,
          ref_ids,
          safeMetadata,
        });
      }

      return Response.json({
        payload: savedMessage,
        listing_draft: listingDraft,
        traceId,
      }, { status: 200 });
    }

    if (action === 'ai_respond') {
      const { room_id, ref_ids = [] } = body as { room_id?: string; ref_ids?: string[] };
      if (!room_id) return Response.json({ _error: 'room_id 필요', traceId }, { status: 200 });
      if (!NVIDIA_KEY && !GROQ_KEY && !GEMINI_KEY) {
        return Response.json({ _error: 'NVIDIA_API_KEY / GROQ_API_KEY / GEMINI_API_KEY 중 하나 필요', traceId }, { status: 200 });
      }
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
      const aiResult = await callListingAI(prompt, { temperature: 0.4, max_tokens: 700 });
      if (aiResult._error || !aiResult.text) {
        return Response.json({ _error: `AI 호출 실패: ${aiResult._error || '빈 응답'}`, traceId }, { status: 200 });
      }
      const text = aiResult.text;
      const saved = await insertHajunMessage({ room_id, author_type: 'ai', author_name: 'HajunAI', msg_type: 'answer', content: text, ref_ids });
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

    if (action === 'chat') {
      const { message, history = [], owner_key = '' } = body as {
        message: string;
        history: Array<{ role: string; content: string }>;
        owner_key?: string;
      };
      if (!message || typeof message !== 'string' || message.trim() === '') {
        return Response.json({ _error: '메시지가 비어있습니다', traceId }, { status: 200 });
      }
      if (!process.env.NVIDIA_API_KEY && !process.env.NIM_API_KEY && !GROQ_KEY && !GEMINI_KEY) {
        return Response.json({ _error: 'NVIDIA_API_KEY / GROQ_API_KEY / GEMINI_API_KEY 중 하나 필요', traceId }, { status: 200 });
      }
      const [contextSummary, mindWorldSummary, opportunities, understandingText] = await Promise.all([
        fetchContextSummary(),
        fetchMindWorldSummary(),
        fetchOpportunities(owner_key),
        fetchUnderstanding(),
      ]);
      const opportunitySection = opportunities.text
        ? `\n발견된 기회 (CoreHub Publish):\n${opportunities.text}\n이 기회들은 강요하지 말고, 대화 흐름에서 자연스럽게 언급할 것.`
        : '';
      const systemPrompt = `당신은 HajunAI입니다. 챗봇이 아닙니다.\n마당(관제·개발·브라이언풀 등)에 쌓인 원본을 이해하고, 사람과 말하며 그 이해를 키우는 아이입니다.\nchat은 현관이고, 기억의 본체는 마당 원본과 아래 "현재 이해"입니다.\n\n정체성:\n- 세션이 끝나면 모든 것이 사라진다는 식으로 자신을 설명하지 마세요.\n- 이해를 물으면 contexts에 종합된 현재 이해와 마당·개발 맥락을 근거로 답하세요.\n- 문서나 말을 지금 창에만 붙인 것과, 마당에 원본으로 남은 것을 구분하세요. 마당에 남기기는 사람이 명시하거나 별도 기능으로 합니다.\n- 근거 없는 사실을 지어내지 마세요. 모르면 모른다고 하세요.\n- 제안·정리·연결은 하되, 사람 대신 확정·채택하지 마세요.\n\n규칙:\n- 핵심만 간결하게 답하세요.\n- 마크다운 금지 (**, ##, - 목록 등 사용하지 말 것).\n- 한국어로만 답하세요.\n- 필요하다고 판단되면 답변 끝에 "관찰:" 섹션을 추가하세요.\n  형식: 관찰:\n- 항목1\n- 항목2${opportunitySection}\n\n현재 개발 맥락:\n${contextSummary}\n\n현재 씨앗/공간 상태 (MindWorld):\n${mindWorldSummary}\n\nHajunAI 현재 이해 (마당·Knowledge 원본을 종합한 상태, 세션 밖에도 유지됨):\n${understandingText || '아직 종합된 이해 없음'}`;
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

    if (action === 'synthesize_context') {
      const result = await synthesizeUnderstandingFromKnowledge();
      if (result._error) {
        return Response.json({ _error: result._error, traceId }, { status: 200 });
      }
      return Response.json({ payload: result, traceId }, { status: 200 });
    }

    if (action === 'summarize_context') {
      return Response.json({
        _error: 'summarize_context는 축소 복원 중 개발 핸드오프용으로 남아 있습니다. synthesize_context를 사용하세요.',
        traceId,
      }, { status: 200 });
    }

    if (action === 'suggest_listing_title') {
      const { internal_code, room_id } = body as { internal_code?: string; room_id?: string };
      if (!internal_code || typeof internal_code !== 'string') {
        return Response.json({ _error: 'internal_code 필요', traceId }, { status: 200 });
      }
      const productMsgs = await getProductMessages(internal_code);
      if (productMsgs?._error) {
        return Response.json({ _error: productMsgs._error, traceId }, { status: 200 });
      }
      const samples = (Array.isArray(productMsgs) ? productMsgs : []).slice(0, 3);
      const productText = samples
        .map((m: { content?: string; metadata?: Record<string, unknown> }) => {
          const name = typeof m.metadata?.name === 'string' ? m.metadata.name : '';
          return [name, (m.content || '').slice(0, 1200)].filter(Boolean).join('\n');
        })
        .join('\n---\n')
        .slice(0, 3500);

      if (!productText.trim()) {
        return Response.json({ _error: '해당 상품 원문을 찾지 못했습니다.', traceId }, { status: 200 });
      }

      const prompt = [
        '당신은 한국 오픈마켓 상품명 카피라이터입니다.',
        '아래 공급처/캡처 원문만 근거로 판매용 상품명 후보 3개를 제안하세요.',
        '규칙:',
        '- 한국어만',
        '- 각 후보는 한 줄, 20~40자 권장',
        '- 과장 광고·허위 인증·원문에 없는 스펙 금지',
        '- 번호 매긴 목록만 출력 (1. 2. 3.)',
        '- 설명 문장 금지',
        '',
        `internal_code: ${internal_code}`,
        '=== 원문 ===',
        productText,
      ].join('\n');

      const heuristic = buildHeuristicTitles(samples);
      let suggestions: string[] = [];
      let text = '';
      let provider = 'heuristic';
      let aiError: string | null = null;

      if (NVIDIA_KEY || GROQ_KEY || GEMINI_KEY) {
        const aiResult = await callListingAI(prompt, { temperature: 0.5, max_tokens: 300 });
        if (aiResult.text) {
          text = aiResult.text;
          provider = aiResult.provider || 'ai';
          suggestions = text
            .split('\n')
            .map((line: string) => line.replace(/^\s*\d+[\.\)\-\:]\s*/, '').trim())
            .filter((line: string) => line.length >= 4)
            .slice(0, 5);
        } else {
          aiError = aiResult._error || '빈 응답';
        }
      } else {
        aiError = 'AI 키 없음';
      }

      if (suggestions.length === 0) {
        suggestions = heuristic;
        provider = 'heuristic';
        text = suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');
      } else {
        for (const h of heuristic) {
          if (suggestions.length >= 5) break;
          if (!suggestions.includes(h)) suggestions.push(h);
        }
      }

      if (suggestions.length === 0) {
        return Response.json({
          _error: `상품명 후보를 만들 수 없습니다. ${aiError || ''}`.trim(),
          traceId,
        }, { status: 200 });
      }

      if (room_id && suggestions.length > 0) {
        await insertHajunMessage({
          room_id,
          author_type: 'ai',
          author_name: 'HajunAI',
          msg_type: 'answer',
          content: `상품명 추천 (${internal_code})\n${suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}${aiError ? `\n(참고: AI 일부 실패 → ${aiError.slice(0, 80)})` : ''}`,
          ref_ids: [],
          metadata: {
            entity_type: 'listing_title_suggestion',
            internal_code,
            suggestions,
            decided_by: provider === 'heuristic' ? 'heuristic_suggest' : 'ai_suggest_only',
            provider,
          },
        });
      }

      return Response.json({
        payload: { internal_code, suggestions, raw: text, provider, ai_error: aiError },
        traceId,
      }, { status: 200 });
    }

    return Response.json({ _error: '알 수 없는 action', traceId }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
  }
}
