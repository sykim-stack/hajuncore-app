'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  HajunYard, HajunRoomWithLatest, MSG_TYPE_LABEL, MSG_TYPE_COLOR, MsgType,
} from '@/types/hajun';

const S: Record<string, React.CSSProperties> = {
  page:   { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main:   { flex: 1, padding: 'var(--page-py) var(--page-px)', overflowY: 'auto', minWidth: 0 },
  title:  { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sub:    { fontSize: 12, color: 'var(--text2)', marginBottom: 28, fontFamily: 'JetBrains Mono, monospace' },
  yardGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' },
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

export default function HajunHome() {
  const [yards, setYards]     = useState<HajunYard[]>([]);
  const [byYard, setByYard]   = useState<Record<string, HajunRoomWithLatest[]>>({});
  const [loading, setLoading] = useState(true);

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

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div className="mobile-header-space" />
        <div style={S.title}>🏠 하준아이</div>
        <div style={S.sub}>마당 · 거실 · 방 — 메시지는 오직 방에만 산다. 나머지는 전부 뷰다.</div>

        {loading && <div style={{ color: 'var(--text2)', fontSize: 13 }}>⏳ 로딩 중...</div>}

        {!loading && (
          <div style={S.yardGrid} className="yard-grid">
            {yards.map((yard) => {
              const rooms = byYard[yard.key] || [];
              return (
                <div key={yard.id} style={S.yardCard}>
                  <Link href={`/hajun/${yard.key}`} style={S.yardHead}>
                    <span style={S.yardName}>{yard.name}</span>
                    <span style={S.yardArrow}>거실 보기 →</span>
                  </Link>
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