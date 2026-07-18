// lib/snapshotToKnowledge.ts
// Step 3: house_snapshots → Knowledge Unit 변환
// ADR-001: Derived Data Layer
// ADR-K04: derived_at, derived_version, derived_by, source_message_ids 필수
// 참고용 — route.ts sync_snapshot action이 직접 구현하므로 별도 호출 불필요

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY!;

type SnapshotContent = {
  house: { id: string; title: string; primary_language: string };
  rooms: Array<{
    room_name: string; seed_mode: boolean; bloom_date: string | null;
    visibility: string; message_count: number;
  }>;
  summary: {
    total_posts: number; total_rooms: number; seed_rooms: number;
    total_fruits: number; bloomed_seeds: number; total_harvested: number;
    total_messages: number;
  };
  last_activity: string;
  snapshot_range: { from: string; to: string };
};

type HouseSnapshot = {
  id: string;
  house_id: string;
  snapshot_type: string;
  derived_at: string;
  derived_version: number;
  derived_by: string;
  source_message_ids: string[];
  content: SnapshotContent;
};

function buildSummary(content: SnapshotContent): string {
  const { house, summary, rooms } = content;
  const parts: string[] = [];
  parts.push(`${house.title} (${house.primary_language})`);
  if (summary.seed_rooms > 0)    parts.push(`씨앗방 ${summary.seed_rooms}개 활성`);
  if (summary.bloomed_seeds > 0) parts.push(`${summary.bloomed_seeds}개의 씨앗이 꽃을 피웠음`);
  if (summary.total_fruits > 0)  parts.push(`열매 ${summary.total_fruits}개`);
  if (summary.total_harvested > 0) parts.push(`수확 ${summary.total_harvested}개`);
  parts.push(`메시지 ${summary.total_messages}개, 방 ${summary.total_rooms}개`);
  const seedRooms = rooms.filter(r => r.seed_mode);
  if (seedRooms.length > 0)
    parts.push(`씨앗: ${seedRooms.map(r => r.room_name).join(', ')}`);
  return parts.join(' · ');
}

function buildKeywords(content: SnapshotContent): string[] {
  const { house, summary, rooms } = content;
  const kw: string[] = ['life', 'CoreNull'];
  if (house.primary_language) kw.push(`lang_${house.primary_language}`);
  if (summary.seed_rooms > 0)    kw.push('seed_active');
  if (summary.bloomed_seeds > 0) kw.push('bloomed');
  if (summary.total_fruits > 0)  kw.push('fruit');
  if (summary.total_harvested > 0) kw.push('harvested');
  if (rooms.some(r => r.visibility === 'public')) kw.push('public_space');
  if (rooms.some(r => r.visibility === 'family')) kw.push('family_space');
  if (summary.total_messages > 10) kw.push('high_activity');
  else if (summary.total_messages > 0) kw.push('low_activity');
  else kw.push('inactive');
  return kw;
}

function calcConfidence(snapshot: HouseSnapshot): number {
  let conf = 0.55;
  const { summary } = snapshot.content;
  if (summary.total_messages > 5)  conf += 0.10;
  if (summary.seed_rooms > 0)      conf += 0.05;
  if (summary.total_fruits > 0)    conf += 0.05;
  if (snapshot.source_message_ids.length > 1) conf += 0.05;
  return Math.min(conf, 0.90);
}

export async function convertSnapshotToKnowledgeUnit(
  snapshot: HouseSnapshot
): Promise<{ _error?: string; id?: string }> {
  try {
    const knowledgeUnit = {
      source_ai:      'CoreNull',
      source_core:    'CoreNull',
      knowledge_type: 'life',
      original_message: JSON.stringify(snapshot.content),
      summary:    buildSummary(snapshot.content),
      keywords:   buildKeywords(snapshot.content),
      confidence: calcConfidence(snapshot),
      observed_at:        snapshot.content.last_activity || snapshot.derived_at,
      derived_at:         snapshot.derived_at,
      derived_version:    String(snapshot.derived_version),
      derived_by:         snapshot.derived_by || 'CoreNull',
      source_message_ids: snapshot.source_message_ids,
      meta: {
        snapshot_id:   snapshot.id,
        house_id:      snapshot.house_id,
        snapshot_type: snapshot.snapshot_type,
        house_title:   snapshot.content.house.title,
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
      return { _error: `Knowledge Unit 저장 실패: ${err}` };
    }
    const data = await res.json();
    return { id: data[0]?.id };
  } catch (e) {
    return { _error: e instanceof Error ? e.message : String(e) };
  }
}