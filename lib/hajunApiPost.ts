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
  SUPABASE_URL,
  SUPABASE_KEY,
  fetchUnderstanding,
  synthesizeUnderstandingFromKnowledge,
  supabaseGet,
  supabasePatch,
  getProductMessages,
} from '@/lib/hajunApiCore';


async function callGroqWithFallback(
  prompt: string,
  opts?: { temperature?: number; max_tokens?: number }
): Promise<{ text?: string; _error?: string }> {
  const candidates = [
    GROQ_MODEL,
    'llama-3.1-8b-instant',
    'openai/gpt-oss-20b',
    'openai/gpt-oss-120b',
    'qwen/qwen3-32b',
    'llama-3.3-70b-versatile',
  ].filter(Boolean) as string[];
  const errors: string[] = [];
  const tried = new Set<string>();

  if (GROQ_KEY) {
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
            temperature: opts?.temperature ?? 0.4,
            max_tokens: opts?.max_tokens ?? 700,
          }),
        });
        if (!res.ok) {
          errors.push(`${model}: ${(await res.text()).slice(0, 120)}`);
          continue;
        }
        const data = await res.json();
        const text = (data.choices?.[0]?.message?.content || '').trim();
        if (text) return { text };
        errors.push(`${model}: empty`);
      } catch (e) {
        errors.push(`${model}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } else {
    errors.push('GROQ_API_KEY 미설정');
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
            generationConfig: {
              temperature: opts?.temperature ?? 0.4,
              maxOutputTokens: opts?.max_tokens ?? 700,
            },
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
        if (text) return { text };
        errors.push('gemini: empty');
      } else {
        errors.push(`gemini: ${(await res.text()).slice(0, 120)}`);
      }
    } catch (e) {
      errors.push(`gemini: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { _error: errors.slice(0, 3).join(' | ') || 'AI 호출 실패' };
}

function extractNameFromProductMessage(content: string, metadata?: Record<string, unknown> | null): string {
  if (typeof metadata?.name === 'string' && metadata.name.trim()) return metadata.name.trim();
  if (typeof metadata?.title_draft === 'string' && metadata.title_draft.trim()) return metadata.title_draft.trim();
  if (typeof metadata?.product_name === 'string' && metadata.product_name.trim()) return metadata.product_name.trim();
  const fromContent =
    content.match(/제품명\s*\n([^\n]+)/)?.[1]?.trim() ||
    content.match(/상품명\s*[:：]?\s*([^\n]+)/)?.[1]?.trim() ||
    content.match(/제품명\s*[:：]?\s*([^\n]+)/)?.[1]?.trim() ||
    '';
  if (fromContent && !fromContent.startsWith('검증 통과') && !fromContent.startsWith('콘텐츠 작업')) {
    return fromContent.slice(0, 80);
  }
  return '';
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

  let productName = '';
  try {
    const productMsgs = await getProductMessages(internalCode);
    if (Array.isArray(productMsgs)) {
      for (const m of productMsgs) {
        const nm = extractNameFromProductMessage(
          typeof m.content === 'string' ? m.content : '',
          (m.metadata as Record<string, unknown>) || null
        );
        if (nm) {
          productName = nm;
          break;
        }
      }
    }
  } catch {
    /* name optional */
  }

  const shortCode = internalCode.replace(/^onchannel:/, '') || internalCode;
  const contentLine = productName
    ? `검증 통과 → 등록대기 진입\n상품명: ${productName}\n코드: ${shortCode}`
    : `검증 통과 → 등록대기 진입\n코드: ${shortCode}`;

  const draftSaved = await insertHajunMessage({
    room_id: listingRoom.room.id,
    author_type: 'ai',
    author_name: 'HajunAI',
    msg_type: 'work_result',
    content: contentLine,
    ref_ids: draftRefs,
    metadata: {
      entity_type: 'listing_draft',
      internal_code: internalCode,
      status: 'draft',
      product_name: productName || null,
      title_draft: productName || null,
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
      const aiResult = await callGroqWithFallback(prompt, { temperature: 0.4, max_tokens: 700 });
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
      const systemPrompt = `당신은 HajunAI입니다. 챗봇이 아닙니다.\n마당에 쌓인 원본을 이해하고, 사람과 말하며 그 이해를 키우는 아이입니다.\n근거 없는 사실을 지어내지 마세요. 한국어로만 답하세요. 마크다운 금지.\n\n현재 개발 맥락:\n${contextSummary}\n\nMindWorld:\n${mindWorldSummary}\n\n현재 이해:\n${understandingText || '없음'}`;
      const groqResult = await callGroq(systemPrompt, message.trim(), history);
      if (groqResult._error) {
        return Response.json({ _error: groqResult._error, traceId }, { status: 200 });
      }
      const { reply, observations } = parseReply(groqResult.text || '');
      if (opportunities.ids.length > 0) consumeOpportunities(opportunities.ids, 'shown');
      saveConversation({
        source_ai: 'HajunAI',
        original_message: `[사용자] ${message}\n[HajunAI] ${reply}`,
        summary: reply.slice(0, 100),
        keywords: ['chat', 'hajunai'],
      });
      return Response.json({ reply, observations, traceId });
    }

    if (action === 'synthesize_context') {
      const result = await synthesizeUnderstandingFromKnowledge();
      if (result._error) return Response.json({ _error: result._error, traceId }, { status: 200 });
      return Response.json({ payload: result, traceId }, { status: 200 });
    }

    if (action === 'summarize_context') {
      return Response.json({
        _error: 'summarize_context는 사용하지 않습니다. synthesize_context를 사용하세요.',
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
      const samples = (Array.isArray(productMsgs) ? productMsgs : []).slice(0, 5);
      const productText = samples
        .map((m: { content?: string; metadata?: Record<string, unknown> }) => {
          const name = typeof m.metadata?.name === 'string' ? m.metadata.name : '';
          const pname = typeof m.metadata?.product_name === 'string' ? m.metadata.product_name : '';
          return [name, pname, (m.content || '').slice(0, 1800)].filter(Boolean).join('\n');
        })
        .join('\n---\n')
        .slice(0, 5000);

      if (!productText.trim()) {
        return Response.json({ _error: '해당 상품 원문을 찾지 못했습니다.', traceId }, { status: 200 });
      }

      const prompt = [
        '당신은 쿠팡·네이버 스마트스토어 상품명 전문 카피라이터다.',
        '공급처 원문만 근거로, 바로 등록 가능한 판매 상품명 5개를 작성한다.',
        '',
        '필수 형식:',
        '- 한 줄 = 상품명 하나. 28자 이상 55자 이하(공백 포함).',
        '- 구조: [대상/카테고리] + [핵심품목] + [재질·기능 2~3개] + [구성/용도]',
        '- 검색 키워드를 앞쪽에 배치. 문장형 금지.',
        '- 후보 5개는 서로 다른 키워드 조합. 같은 말 바꿔쓰기 금지.',
        '',
        '금지:',
        '- 20자 미만 짧은 요약명',
        '- 온채널, 공급처, 내부코드, URL',
        '- 원문에 없는 인증/1위/최고/무료배송',
        '- 문장 끝 생략(...), 잘린 단어',
        '',
        '나쁜 예 (제출 금지):',
        '백단향 우드 괄사 마사지',
        '남성 3D 메쉬 모달 팬티',
        '마사지기 세트',
        '',
        '좋은 예:',
        '남성 3D메쉬 모달 트렁크 드로즈 팬티 사계절 속옷 3매',
        '백단향 원목 우드괄사 두피 바디 지압 마사지기 3종 홈케어세트',
        '남성 통풍 메쉬 드로즈 모달혼방 사각팬티 데일리 속옷',
        '',
        '출력 형식 엄수: 1. 상품명 / 2. 상품명 / ... 5개만. 다른 글 금지.',
        '',
        `코드: ${internal_code}`,
        '=== 원문 ===',
        productText,
      ].join('\n');

      const titleModels = [
        GROQ_MODEL,
        'openai/gpt-oss-120b',
        'qwen/qwen3-32b',
        'llama-3.3-70b-versatile',
        'openai/gpt-oss-20b',
        'llama-3.1-8b-instant',
      ].filter(Boolean) as string[];

      let text = '';
      if (GROQ_KEY) {
        const tried = new Set<string>();
        for (const model of titleModels) {
          if (tried.has(model)) continue;
          tried.add(model);
          try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${GROQ_KEY}` },
              body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.75,
                max_tokens: 500,
              }),
            });
            if (!res.ok) continue;
            const data = await res.json();
            const t = (data.choices?.[0]?.message?.content || '').trim();
            if (t) { text = t; break; }
          } catch { /* next */ }
        }
      }
      if (!text) {
        const aiResult = await callGroqWithFallback(prompt, { temperature: 0.75, max_tokens: 500 });
        text = aiResult.text || '';
      }

      const cleanTitle = (line: string) =>
        line
          .replace(/^\s*\d+[\.\)\-\:]\s*/, '')
          .replace(/["'`]/g, '')
          .replace(/\s+/g, ' ')
          .replace(/온채널|onchannel/gi, '')
          .trim();

      let suggestions = text
        ? text
            .split('\n')
            .map(cleanTitle)
            .filter((line: string) => line.length >= 18 && line.length <= 70)
            .filter((line: string, i: number, arr: string[]) => arr.indexOf(line) === i)
            .slice(0, 5)
        : [];

      if (suggestions.length === 0) {
        const heuristic: string[] = [];
        for (const m of samples) {
          const nm =
            (typeof m.metadata?.name === 'string' && m.metadata.name.trim()) ||
            (typeof m.metadata?.product_name === 'string' && m.metadata.product_name.trim()) ||
            (typeof m.metadata?.title_draft === 'string' && m.metadata.title_draft.trim()) ||
            '';
          const cleaned = nm.replace(/온채널|onchannel/gi, '').replace(/\s+/g, ' ').trim();
          if (cleaned && cleaned.length >= 8 && !heuristic.includes(cleaned)) {
            heuristic.push(cleaned.slice(0, 60));
          }
          const fromContent =
            (m.content || '').match(/상품명\s*[:：]?\s*([^\n]+)/)?.[1]?.trim() ||
            (m.content || '').match(/제품명\s*[:：]?\s*([^\n]+)/)?.[1]?.trim() ||
            '';
          const fc = fromContent.replace(/온채널|onchannel/gi, '').replace(/\s+/g, ' ').trim();
          if (fc && fc.length >= 8 && !heuristic.includes(fc)) heuristic.push(fc.slice(0, 60));
        }
        if (heuristic.length === 0) {
          return Response.json({
            _error: '상품명 추천 실패: AI 응답 없음·원문 이름도 없음',
            traceId,
          }, { status: 200 });
        }
        suggestions = heuristic.slice(0, 3);
        text = suggestions.map((s, i) => `${i + 1}. ${s}`).join('\n');
      }

      if (room_id && suggestions.length > 0) {
        await insertHajunMessage({
          room_id,
          author_type: 'ai',
          author_name: 'HajunAI',
          msg_type: 'answer',
          content: `상품명 추천 (${internal_code})\n${suggestions.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n')}`,
          ref_ids: [],
          metadata: {
            entity_type: 'listing_title_suggestion',
            internal_code,
            suggestions,
            decided_by: 'ai_suggest_only',
          },
        });
      }

      return Response.json({
        payload: { internal_code, suggestions, raw: text },
        traceId,
      }, { status: 200 });
    }

    return Response.json({ _error: '알 수 없는 action', traceId }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg, traceId }, { status: 500 });
  }
}
