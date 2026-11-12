// lib/hajunApiPost.ts
// Restored handlers (ai_respond max_tokens 2500). Full historical body: see git ce09b94a74df.
import {
  createTraceId,
  getRoomByKeys,
  isProductMeta,
  type HajunRoomRow,
} from '@/lib/hajunApiCore'
import {
  handleCreateListing,
  handleRecordSignal,
  handleSuggestListingTitle,
} from '@/lib/hajunApiHandlers'

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile'

async function callGroqWithFallback(
  prompt: string,
  opts?: { temperature?: number; max_tokens?: number }
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const key = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY
  if (!key) return { ok: false, error: 'GROQ_API_KEY missing' }
  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: opts?.temperature ?? 0.4,
        max_tokens: opts?.max_tokens ?? 1200,
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      return { ok: false, error: `groq_${res.status}:${t.slice(0, 200)}` }
    }
    const json = await res.json()
    const text = json?.choices?.[0]?.message?.content
    if (!text || typeof text !== 'string') return { ok: false, error: 'empty_groq_content' }
    return { ok: true, text }
  } catch (e: any) {
    const geminiKey = process.env.GEMINI_API_KEY
    if (geminiKey) {
      try {
        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: opts?.temperature ?? 0.4,
                maxOutputTokens: opts?.max_tokens ?? 1200,
              },
            }),
            signal: AbortSignal.timeout(60000),
          }
        )
        if (gRes.ok) {
          const gJson = await gRes.json()
          const text = gJson?.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) return { ok: true, text }
        }
      } catch { /* ignore */ }
    }
    return { ok: false, error: e?.message || String(e) }
  }
}

function buildRoomContext(room: HajunRoomRow | null): string {
  if (!room) return ''
  return [`방: ${room.title || room.room_key}`, room.summary ? `요약: ${room.summary}` : '']
    .filter(Boolean)
    .join('\n')
}

function buildHermesHint(judgment: any): string {
  if (!judgment || typeof judgment !== 'object') return ''
  try {
    const kind = judgment.kind || judgment.type || ''
    const note = judgment.note || judgment.summary || ''
    if (!kind && !note) return ''
    return `\n[Hermes 제안-only] kind=${kind} ${note}`.slice(0, 400)
  } catch {
    return ''
  }
}

export async function POST(req: Request) {
  const traceId = createTraceId()
  try {
    const body = await req.json().catch(() => ({}))
    const action = body?.action || body?.type || ''

    if (action === 'create_listing') return handleCreateListing(body, traceId)
    if (action === 'record_signal') return handleRecordSignal(body, traceId)
    if (action === 'suggest_listing_title') return handleSuggestListingTitle(body, traceId)

    if (action === 'ai_respond' || action === 'chat' || action === 'message') {
      const message = String(body.message || body.text || '').trim()
      if (!message) {
        return Response.json({ _error: 'message_required', traceId }, { status: 200 })
      }
      const yard = body.yard || body.yard_key || null
      const roomKey = body.room || body.room_key || null
      let room: HajunRoomRow | null = null
      if (yard && roomKey) room = await getRoomByKeys(String(yard), String(roomKey))
      const roomCtx = buildRoomContext(room)
      const hermesHint = buildHermesHint(body.judgment || body.hermes_judgment)
      const productHint =
        room && isProductMeta(room.meta)
          ? '\n상품/리스팅 맥락이면 제목·요약 제안만 하고 결제/주문은 실행하지 마세요.'
          : ''
      const prompt = [
        '당신은 HajunAI 도우미입니다. 한국어로 명확하고 완전하게 답하세요.',
        '중간에 문장을 끊지 마세요. 실행(결제, 삭제, 외부 전송)은 하지 말고 제안만 하세요.',
        roomCtx ? `\n[방 맥락]\n${roomCtx}` : '',
        productHint,
        hermesHint,
        `\n[사용자]\n${message}`,
      ]
        .filter(Boolean)
        .join('\n')

      const aiResult = await callGroqWithFallback(prompt, { temperature: 0.35, max_tokens: 2500 })
      if (!aiResult.ok) {
        return Response.json({ _error: aiResult.error, reply: null, traceId }, { status: 200 })
      }
      return Response.json(
        {
          data: {
            reply: aiResult.text,
            room_id: room?.id || null,
            yard,
            room_key: roomKey,
          },
          traceId,
        },
        { status: 200 }
      )
    }

    if (action === 'summarize_room') {
      const yard = body.yard || body.yard_key
      const roomKey = body.room || body.room_key
      if (!yard || !roomKey) {
        return Response.json({ _error: 'yard_room_required', traceId }, { status: 200 })
      }
      const room = await getRoomByKeys(String(yard), String(roomKey))
      if (!room) return Response.json({ _error: 'room_not_found', traceId }, { status: 200 })
      const notes = Array.isArray(body.notes) ? body.notes.slice(0, 30).join('\n') : ''
      const prompt = [
        '다음 방 정보를 2~4문장으로 요약하세요. 실행 지시 없이 요약만.',
        `제목: ${room.title || room.room_key}`,
        room.summary ? `기존 요약: ${room.summary}` : '',
        notes ? `메모:\n${notes}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      const aiResult = await callGroqWithFallback(prompt, { temperature: 0.3, max_tokens: 600 })
      if (!aiResult.ok) return Response.json({ _error: aiResult.error, traceId }, { status: 200 })
      return Response.json(
        { data: { summary: aiResult.text, room_id: room.id }, traceId },
        { status: 200 }
      )
    }

    if (action === 'suggest_reply') {
      const message = String(body.message || '').trim()
      const context = String(body.context || '').trim()
      const prompt = [
        '아래 대화에 대한 짧은 답장 초안 2~3개를 번호로 제시하세요. 실행하지 마세요.',
        context ? `맥락:\n${context}` : '',
        `메시지:\n${message}`,
      ]
        .filter(Boolean)
        .join('\n')
      const aiResult = await callGroqWithFallback(prompt, { temperature: 0.5, max_tokens: 800 })
      if (!aiResult.ok) return Response.json({ _error: aiResult.error, traceId }, { status: 200 })
      return Response.json({ data: { suggestions: aiResult.text }, traceId }, { status: 200 })
    }

    if (action === 'analyze_product' || action === 'product_insight') {
      const title = body.title || body.product_title || ''
      const desc = body.description || body.product_description || ''
      const prompt = [
        '상품 정보를 바탕으로 판매 포인트 3가지와 주의점 1가지를 짧게 제안하세요. 주문/결제 실행 금지.',
        title ? `제목: ${title}` : '',
        desc ? `설명: ${desc}` : '',
      ]
        .filter(Boolean)
        .join('\n')
      const aiResult = await callGroqWithFallback(prompt, { temperature: 0.4, max_tokens: 400 })
      if (!aiResult.ok) return Response.json({ _error: aiResult.error, traceId }, { status: 200 })
      return Response.json({ data: { insight: aiResult.text }, traceId }, { status: 200 })
    }

    return Response.json({ _error: `Unknown POST action: ${action}`, traceId }, { status: 200 })
  } catch (e) {
    return Response.json(
      { _error: e instanceof Error ? e.message : String(e), traceId },
      { status: 200 }
    )
  }
}
