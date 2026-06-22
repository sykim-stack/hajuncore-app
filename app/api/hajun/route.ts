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
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 1024,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );
    const data = await res.json();
    if (data.error) return '(Gemini 오류: ' + data.error.message + ')';
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '(분석 실패)';
  } catch(e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return '(Gemini 예외: ' + msg + ')';
  }
}

async function getMindWorld() {
  const today = new Date().toISOString().split('T')[0];
  const threeDaysLater = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // 1. 씨앗방 전체 조회
  const allRooms = await supabaseGet('corenull_rooms?house_id=eq.' + HOUSE_ID);
  console.log('[MindWorld] allRooms:', allRooms.length, JSON.stringify(allRooms).substring(0, 200));
  const seedRooms = allRooms.filter((r: any) => r.seed_mode === true);
  console.log('[MindWorld] seedRooms:', seedRooms.length);

  const allRoomIds = allRooms.map((r: any) => r.id);
  if (allRoomIds.length === 0) {
    return {
      message: '하준님, 아직 방이 없어요. 첫 씨앗을 심어볼까요?',
      seeds: { total: 0, bloomingSoon: [], bloomed: [], neglected: [], active: [] },
      fruits: { unharvested: [], harvested: [] },
      recentActivity: [],
      today
    };
  }

  const roomIdList = allRoomIds.join(',');

  // 2. post 조회 (씨앗 활동 분석용)
  const recentPosts = await supabaseGet(
    'messages?room_id=in.(' + roomIdList + ')' +
    '&type=eq.post' +
    '&order=created_at.desc&limit=50'
  );

  // 3. 미수확 열매 — 알려주기만, 결정 대행 금지
  const unharvestedFruits = await supabaseGet(
    'messages?room_id=in.(' + roomIdList + ')' +
    '&type=eq.fruit' +
    '&harvested_at=is.null' +
    '&order=created_at.desc'
  );

  // 4. 수확된 열매 (최근 5개)
  const harvestedFruits = await supabaseGet(
    'messages?room_id=in.(' + roomIdList + ')' +
    '&type=eq.fruit' +
    '&harvested_at=not.is.null' +
    '&order=harvested_at.desc&limit=5'
  );

  console.log('[MindWorld] unharvestedFruits:', unharvestedFruits.length);
  console.log('[MindWorld] harvestedFruits:', harvestedFruits.length);

  // 5. 꽃 피기 임박 / 이미 꽃 핀 씨앗
  const bloomingSoon = seedRooms.filter((r: any) =>
    r.bloom_date && r.bloom_date >= today && r.bloom_date <= threeDaysLater
  );
  const bloomed = seedRooms.filter((r: any) =>
    r.bloom_date && r.bloom_date < today
  );

  // 6. 씨앗방별 마지막 post 날짜
  const lastPostByRoom: Record<string, string> = {};
  for (const m of recentPosts) {
    if (!lastPostByRoom[m.room_id]) lastPostByRoom[m.room_id] = m.created_at;
  }

  // 7. 방치된 씨앗 / 활동한 씨앗
  const neglectedSeeds = seedRooms.filter((r: any) => {
    const last = lastPostByRoom[r.id];
    if (!last) return true;
    return last < sevenDaysAgo;
  });
  const activeSeeds = seedRooms.filter((r: any) => {
    const last = lastPostByRoom[r.id];
    return last && last >= sevenDaysAgo;
  });

  // 8. 최근 활동 요약
  const recentActivity = recentPosts.slice(0, 5).map((m: any) => ({
    room_id: m.room_id,
    content: m.content?.substring(0, 50),
    created_at: m.created_at
  }));

  // 9. room_id → room_name 매핑 (Fruit 표시용)
  const roomNameMap: Record<string, string> = {};
  for (const r of allRooms) roomNameMap[r.id] = r.room_name;

  const unharvestedList = unharvestedFruits.map((m: any) => ({
    content: m.content?.substring(0, 50),
    room_name: roomNameMap[m.room_id] || '알 수 없는 방',
    created_at: m.created_at
  }));

  const harvestedList = harvestedFruits.map((m: any) => ({
    content: m.content?.substring(0, 50),
    room_name: roomNameMap[m.room_id] || '알 수 없는 방',
    harvested_at: m.harvested_at
  }));

  // 10. Gemini 프롬프트 — 우선순위: 꽃 임박 > 미수확 열매 > 꽃 핌 > 방치 > 응원
  const geminiPrompt = `당신은 BRAINPOOL의 HajunAI입니다. 사용자의 삶의 흐름을 따뜻하게 읽어주는 AI입니다.
HajunAI는 알려주기만 합니다. Fruit 생성이나 Harvest는 절대 대신 결정하지 않습니다.
아래 데이터를 보고 사용자에게 건네는 한마디를 작성해주세요.
형식: "하준님, [따뜻하고 구체적인 한마디]"
100자 이내, 마크다운 금지.

오늘 날짜: ${today}
씨앗방 목록: ${JSON.stringify(seedRooms.map((r: any) => ({ name: r.room_name, bloom_date: r.bloom_date, last_post: lastPostByRoom[r.id] || null })))}
꽃 피기 임박 (3일 이내): ${JSON.stringify(bloomingSoon.map((r: any) => ({ name: r.room_name, bloom_date: r.bloom_date })))}
이미 꽃 핀 씨앗: ${JSON.stringify(bloomed.map((r: any) => ({ name: r.room_name, bloom_date: r.bloom_date })))}
이번 주 기록 없는 씨앗: ${JSON.stringify(neglectedSeeds.map((r: any) => ({ name: r.room_name })))}
미수확 열매: ${JSON.stringify(unharvestedList)}
수확된 열매: ${JSON.stringify(harvestedList)}

우선순위: 꽃 피기 임박 > 미수확 열매 존재 > 이미 꽃 핀 씨앗 > 이번 주 활동 없음 > 일반 응원`;

  const message = await analyzeWithGemini(geminiPrompt);

  return {
    message,
    seeds: {
      total: seedRooms.length,
      bloomingSoon: bloomingSoon.map((r: any) => ({ name: r.room_name, bloom_date: r.bloom_date })),
      bloomed: bloomed.map((r: any) => ({ name: r.room_name, bloom_date: r.bloom_date })),
      neglected: neglectedSeeds.map((r: any) => ({ name: r.room_name, last_post: lastPostByRoom[r.id] || null })),
      active: activeSeeds.map((r: any) => r.room_name)
    },
    fruits: {
      unharvested: unharvestedList,
      harvested: harvestedList
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