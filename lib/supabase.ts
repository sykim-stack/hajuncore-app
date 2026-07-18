// lib/snapshotToKnowledge.ts
// Step 3: house_snapshots → Knowledge Unit 변환
// ADR-001: Derived Data Layer
// ADR-K04: derived_at, derived_version, derived_by, source_message_ids 필수

import { supabaseGet } from '@/lib/supabase';

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

// ── 집 상태를 사람이 읽을 수 있는 요약으로 변환 ──────────────
function buildSummary(content: SnapshotContent): string {
  const { house, summary, rooms } = content;
  const parts: string[] = [];

  parts.push(`${house.title} (${house.primary_language})`);

  if (summary.seed_rooms > 0)
    parts.push(`씨앗방 ${summary.seed_rooms}개 활성`);
  if (summary.bloomed_seeds > 0)
    parts.push(`${summary.bloomed_seeds}개의 씨앗이 꽃을 피웠음`);
  if (summary.total_fruits > 0)
    parts.push(`열매 ${summary.total_fruits}개`);
  if (summary.total_harvested > 0)
    parts.push(`수확 ${summary.total_harvested}개`);

  parts.push(`메시지 ${summary.total_messages}개, 방 ${summary.total_rooms}개`);

  const seedRooms = rooms.filter(r => r.seed_mode);
  if (seedRooms.length > 0)
    parts.push(`씨앗: ${seedRooms.map(r => r.room_name).join(', ')}`);

  return parts.join(' · ');
}

// ── 키워드 생성 ────────────────────────────────────────────────
function buildKeywords(content: SnapshotContent): string[] {
  const { house, summary, rooms } = content;
  const keywords: string[] = ['life', 'CoreNull'];

  if (house.primary_language) keywords.push(`lang_${house.primary_language}`);
  if (summary.seed_rooms > 0) keywords.push('seed_active');
  if (summary.bloomed_seeds > 0) keywords.push('bloomed');
  if (summary.total_fruits > 0) keywords.push('fruit');
  if (summary.total_harvested > 0) keywords.push('harvested');

  const hasPublic = rooms.some(r => r.visibility === 'public');
  const hasFamily = rooms.some(r => r.visibility === 'family');
  if (hasPublic) keywords.push('public_space');
  if (hasFamily) keywords.push('family_space');

  // 활동 빈도
  if (summary.total_messages > 10) keywords.push('high_activity');
  else if (summary.total_messages > 0) keywords.push('low_activity');
  else keywords.push('inactive');

  return keywords;
}

// ── confidence 계산 ────────────────────────────────────────────
function calcConfidence(snapshot: HouseSnapshot): number {
  let conf = 0.55; // weekly 기본값

  const { summary } = snapshot.content;
  if (summary.total_messages > 5)  conf += 0.10;
  if (summary.seed_rooms > 0)      conf += 0.05;
  if (summary.total_fruits > 0)    conf += 0.05;
  if (snapshot.source_message_ids.length > 1) conf += 0.05;

  return Math.min(conf, 0.90); // 자동 변환 최대 0.90
}

// ── 핵심: Snapshot → Knowledge Unit 변환 ──────────────────────
export async function convertSnapshotToKnowledgeUnit(
  snapshot: HouseSnapshot
): Promise<{ _error?: string; id?: string }> {
  try {
    const summary    = buildSummary(snapshot.content);
    const keywords   = buildKeywords(snapshot.content);
    const confidence = calcConfidence(snapshot);

    const knowledgeUnit = {
      // 분류
      source_ai:    'CoreNull',
      source_core:  'CoreNull',
      knowledge_type: 'life',

      // 내용
      original_message: JSON.stringify(snapshot.content),
      summary,
      keywords,
      confidence,

      // 시간
      observed_at: snapshot.content.last_activity || snapshot.derived_at,

      // ADR-K04 Derived Data 메타데이터
      derived_at:         snapshot.derived_at,
      derived_version:    String(snapshot.derived_version),
      derived_by:         snapshot.derived_by || 'CoreNull',
      source_message_ids: snapshot.source_message_ids,

      // 원본 참조 (Single Truth — 복사 아닌 참조)
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

// ── house_id 기준 최신 Snapshot → Knowledge Unit 변환 ─────────
// 중복 방지: 이미 같은 snapshot_id로 저장된 것은 건너뜀
export async function syncHouseSnapshot(
  houseId: string
): Promise<{ _error?: string; skipped?: boolean; id?: string }> {
  try {
    // 1. 최신 Snapshot 1건 가져오기
    const snapshots = await supabaseGet(
      `house_snapshots?house_id=eq.${houseId}&order=derived_at.desc&limit=1`
    );
    if (!snapshots || snapshots.length === 0) {
      return { _error: 'Snapshot 없음' };
    }
    const snapshot = snapshots[0] as HouseSnapshot;

    // 2. 중복 확인 — 같은 snapshot_id가 이미 저장돼 있으면 스킵
    const existing = await supabaseGet(
      `hajunai_conversations?meta->>snapshot_id=eq.${snapshot.id}&limit=1`
    );
    if (existing && existing.length > 0) {
      return { skipped: true };
    }

    // 3. 변환 실행
    return await convertSnapshotToKnowledgeUnit(snapshot);
  } catch (e) {
    return { _error: e instanceof Error ? e.message : String(e) };
  }
}