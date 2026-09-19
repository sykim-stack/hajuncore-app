'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  HajunYard, HajunRoomWithLatest, MSG_TYPE_LABEL, MSG_TYPE_COLOR, MsgType,
  YardTab, TAB_YARD_KEYS, TAB_LABEL, YARD_LABEL,
} from '@/types/hajun';

const S: Record<string, React.CSSProperties> = {
  page:   { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main:   { flex: 1, padding: 'var(--page-py) var(--page-px)', overflowY: 'auto', minWidth: 0 },
  title:  { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sub:    { fontSize: 12, color: 'var(--text2)', marginBottom: 16, fontFamily: 'JetBrains Mono, monospace' },
  tabs:   { display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' as const },
  tab:    { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  tabOn:  { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(88,166,255,0.1)' },
  hint:   { fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 },
  yardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, alignItems: 'start' },
  yardCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' },
  yardHead: { padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'var(--text)' },
  yardName: { fontSize: 16, fontWeight: 700 },
  yardArrow:{ fontSize: 13, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' },
  roomRow:  { display: 'block', padding: '12px 18px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' },
  roomTop:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  roomName: { fontSize: 13, fontWeight: 600 },
  chip:     { fontSize: 10, padding: '2px 7px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 },
  snippet:  { fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty:    { fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' },
};

function chip(type: MsgType) {
  const color = MSG_TYPE_COLOR[type];
  return (
    <span style={{ ...S.chip, background: `${color}22`, color }}>
      {MSG_TYPE_LABEL[type]}
    </span>
  );
}

function YardCard({
  yard,
  rooms,
}: {
  yard: HajunYard;
  rooms: HajunRoomWithLatest[];
}) {
  return (
    <div style={S.yardCard}>
      <Link href={`/hajun/${yard.key}`} style={S.yardHead}>
        <span style={S.yardName}>{yard.name || YARD_LABEL[yard.key] || yard.key}</span>
        <span style={S.yardArrow}>거실 보기 →</span>
      </Link>
      {rooms.length === 0 && (
        <div style={{ padding: '12px 18px' }}>
          <div style={S.empty}>방 없음</div>
        </div>
      )}
      {rooms.map((room) => (
        <Link key={room.id} href={`/hajun/${yard.key}/${room.key}`} style={S.roomRow}>
          <div style={S.roomTop}>
            <span style={S.roomName}>{room.name}</span>
            {room.latest && chip(room.latest.msg_type)}
          </div>
          {room.latest
            ? <div style={S.snippet}>{room.latest.author_name} · {room.latest.content}</div>
            : <div style={S.empty}>아직 메시지 없음</div>}
        </Link>
      ))}
    </div>
  );
}

export default function HajunHome() {
  const [yards, setYards]     = useState<HajunYard[]>([]);
  const [byYard, setByYard]   = useState<Record<string, HajunRoomWithLatest[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<YardTab>('brainpool');

  const load = useCallback(async () => {
    setLoading(true);
    const yardRes = await fetch('/api/hajun?action=yard_list');
    const yardJson = await yardRes.json();
    const yardList: HajunYard[] = yardJson.payload || [];
    setYards(yardList);

    const entries = await Promise.all(
      yardList.map(async (y) => {
        const res = await fetch(`/api/hajun?action=view_yard&yard=${y.key}`);
        const json = await res.json();
        return [y.key, json.payload?.rooms || []] as const;
      })
    );
    setByYard(Object.fromEntries(entries));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const yardByKey = useMemo(() => {
    const m = new Map<string, HajunYard>();
    for (const y of yards) m.set(y.key, y);
    return m;
  }, [yards]);

  const visibleKeys = TAB_YARD_KEYS[tab];

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div className="mobile-header-space" />
        <div style={S.title}>🏠 하준아이</div>
        <div style={S.sub}>마당 · 거실 · 방 — 메시지는 오직 방에만 산다. 나머지는 전부 뷰다.</div>

        <div style={S.tabs}>
          {(['brainpool', 'warehouse'] as YardTab[]).map((t) => (
            <button
              key={t}
              type="button"
              style={{ ...S.tab, ...(tab === t ? S.tabOn : {}) }}
              onClick={() => setTab(t)}
            >
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {tab === 'brainpool' && (
          <div style={S.hint}>본류 · 결정 · 현재 흐름. 관제 · 개발 · 브라이언풀 마당입니다.</div>
        )}
        {tab === 'warehouse' && (
          <div style={S.hint}>상품 검증·등록 작업 공간. 두 마당은 특성이 달라 합치지 않고 따로 둡니다.</div>
        )}

        {loading && <div style={{ color: 'var(--text2)', fontSize: 13 }}>⏳ 로딩 중...</div>}

        {!loading && (
          <div style={S.yardGrid} className="yard-grid">
            {visibleKeys.map((key) => {
              const yard = yardByKey.get(key);
              if (!yard) {
                return (
                  <div key={key} style={S.yardCard}>
                    <div style={{ ...S.yardHead, cursor: 'default' }}>
                      <span style={S.yardName}>{YARD_LABEL[key] || key}</span>
                    </div>
                    <div style={{ padding: '12px 18px' }}>
                      <div style={S.empty}>마당 데이터 없음</div>
                    </div>
                  </div>
                );
              }
              const rooms = byYard[key] || [];
              return <YardCard key={key} yard={yard} rooms={rooms} />;
            })}
          </div>
        )}
      </main>

      <style>{`
        .mobile-header-space { height: 0; }
        @media (max-width: 900px) {
          .yard-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .mobile-header-space { height: 48px !important; }
        }
      `}</style>
    </div>
  );
}
