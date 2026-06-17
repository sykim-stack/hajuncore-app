// app/api/hajun/route.ts
import { supabaseGet, supabasePatch } from '@/lib/supabase';

const HOUSE_ID = '9b06b568-a0c9-4b88-8768-e5acbdaf156a';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

async function analyzeWithGemini(prompt: string): Promise<string> {
  if (!GEMINI_API_KEY) return '(Gemini API Key 없음)';
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } }
        })
      }
    );
    const data = await res.json();
    console.log('[Gemini]', JSON.stringify(data).substring(0, 300));
    if (data.error) return '(Gemini 오류: ' + data.error.message + ')';
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '(분석 실패)';
  } catch(e: any) {
    return '(Gemini 예외: ' + e.message + ')';
  }
}

async function getMindWorld() {
  const today = new Date().toISOString().split('T')[0];
  const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // seed_mode 필터 없이 전체 조회 후 JS에서 필터
  const allRooms = await supabaseGet('corenull_rooms?house_id=eq.' + HOUSE_ID);
  console.log('[MindWorld] allRooms:', allRooms.length);

  const rooms = allRooms.filter((r: any) => r.seed_mode === true);
  console.log('[MindWorld] seedRooms:', rooms.length);

  const bloomingSoon = rooms.filter((r: any) =>
    r.bloom_date && r.bloom_date >= today && r.bloom_date <= threeDaysLater
  );

  const recentMessages = await supabaseGet(
    'messages?house_id=eq.' + HOUSE_ID + '&order=created_at.desc&limit=20'
  );
  console.log('[MindWorld] recentMessages:', recentMessages.length);

  const activeRoomIds = new Set(recentMessages.map((m: any) => m.room_id));
  const neglectedSeeds = rooms.filter((r: any) => !activeRoomIds.has(r.id));

  const recentActivity = recentMessages.slice(0, 5).map((m: any) => ({
    room_id: m.room_id,
    content: m.content?.substring(0, 50),
    created_at: m.created_at
  }));

  const seedList = JSON.stringify(rooms.map((r: any) => ({ name: r.room_name, bloom_date: r.bloom_date })));
  const bloomList = JSON.stringify(bloomingSoon.map((r: any) => r.room_name));
  const neglectList = JSON.stringify(neglectedSeeds.map((r: any) => r.room_name));
  const activityList = JSON.stringify(recentActivity);

  const geminiPrompt = '당신은 BRAINPOOL의 HajunAI입니다. 사용자의 삶의 흐름을 따뜻하게 읽어주는 AI입니다.\n아래 데이터를 보고 사용자에게 건네는 한마디를 작성해주세요.\n형식: "하준님, [따뜻하고 구체적인 한마디]"\n100자 이내, 마크다운 금지.\n\n씨앗방 목록: ' + seedList + '\n꽃 피기 임박: ' + bloomList + '\n방치된 씨앗: ' + neglectList + '\n최근 활동: ' + activityList + '\n오늘 날짜: ' + today;

  const message = await analyzeWithGemini(geminiPrompt);

  return {
    message,
    seeds: {
      total: rooms.length,
      bloomingSoon: bloomingSoon.map((r: any) => ({ name: r.room_name, bloom_date: r.bloom_date })),
      neglected: neglectedSeeds.map((r: any) => ({ name: r.room_name, bloom_date: r.bloom_date }))
    },
    recentActivity,
    today
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    if (action === 'contexts') {
      const data = await supabaseGet('contexts?order=updated_at.desc&limit=1');
      return Response.json({ payload: data[0] || null });
    }
    if (action === 'snapshots') {
      const limit = searchParams.get('limit') || '20';
      const data = await supabaseGet('hajunai_conversations?order=created_at.desc&limit=' + limit);
      return Response.json({ payload: data });
    }
    if (action === 'mindworld') {
      const data = await getMindWorld();
      return Response.json({ payload: data });
    }
    return Response.json({ _error: 'unknown action' }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  try {
    const body = JSON.parse(await req.text());
    if (action === 'update_context') {
      const { id, ...fields } = body;
      if (!id) return Response.json({ _error: 'id required' }, { status: 200 });
      const data = await supabasePatch('contexts', id, {
        ...fields,
        updated_at: new Date().toISOString(),
      });
      return Response.json({ payload: data[0] || null });
    }
    return Response.json({ _error: 'unknown action' }, { status: 200 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json({ _error: msg }, { status: 500 });
  }
}