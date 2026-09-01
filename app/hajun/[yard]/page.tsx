'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  HajunYard, HajunRoomWithMessages, MSG_TYPE_LABEL, MSG_TYPE_COLOR, MsgType,
} from '@/types/hajun';

const S: Record<string, React.CSSProperties> = {
  page:  { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main:  { flex: 1, padding: 'var(--page-py) var(--page-px)', overflowY: 'auto', minWidth: 0 },
  crumb: { fontSize: 12, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sub:   { fontSize: 12, color: 'var(--text2)', marginBottom: 24, fontFamily: 'JetBrains Mono, monospace' },
  grid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 },
  card:  { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, textDecoration: 'none', color: 'var(--text)', display: 'block' },
  head:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' },
  name:  { fontSize: 15, fontWeight: 700 },
  count: { fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' },
  msgRow:{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.04)' },
  msgTop:{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 },
  chip:  { fontSize: 9, padding: '1px 6px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 },
  author:{ fontSize: 11, color: 'var(--text3)' },
  snippet:{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const },
  empty: { fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' },
};

function chip(type: MsgType) {
  const color = MSG_TYPE_COLOR[type];
  return <span style={{ ...S.chip, background: `${color}22`, color }}>{MSG_TYPE_LABEL[type]}</span>;
}

export default function LivingRoomPage() {
  const params = useParams();
  const yardKey = params.yard as string;

  const [yard, setYard]       = useState<HajunYard | null>(null);
  const [rooms, setRooms]     = useState<HajunRoomWithMessages[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/hajun?action=view_livingroom&yard=${yardKey}&limit=4`);
    const json = await res.json();
    setYard(json.payload?.yard || null);
    setRooms(json.payload?.rooms || []);
    setLoading(false);
  }, [yardKey]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div className="mobile-header-space" />
        <div style={S.crumb}>
          <Link href="/hajun" style={{ color: 'var(--text3)' }}>하준아이</Link> {'>'} 거실
        </div>
        <div style={S.title}>{yard?.name || '거실'}</div>
        <div style={S.sub}>이 마당 산하 각 방의 최신 흐름 — 더 깊게 보려면 방으로 들어가세요</div>

        {loading && <div style={{ color: 'var(--text2)', fontSize: 13 }}>⏳ 로딩 중...</div>}

        {!loading && (
          <div style={S.grid} className="living-grid">
            {rooms.map((room) => (
              <Link key={room.id} href={`/hajun/${yardKey}/${room.key}`} style={S.card}>
                <div style={S.head}>
                  <span style={S.name}>{room.name}</span>
                  <span style={S.count}>{room.messages.length}건</span>
                </div>
                {room.messages.length === 0 && <div style={S.empty}>아직 메시지 없음</div>}
                {room.messages.map((m) => (
                  <div key={m.id} style={S.msgRow}>
                    <div style={S.msgTop}>
                      {chip(m.msg_type)}
                      <span style={S.author}>{m.author_name}</span>
                    </div>
                    <div style={S.snippet}>{m.content}</div>
                  </div>
                ))}
              </Link>
            ))}
          </div>
        )}
      </main>

      <style>{`
        .mobile-header-space { height: 0; }
        @media (max-width: 900px) {
          .living-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .mobile-header-space { height: 48px !important; }
        }
      `}</style>
    </div>
  );
}