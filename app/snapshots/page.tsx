'use client';
import { useEffect, useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';

type Snapshot = {
  id: string;
  source_ai?: string;
  original_message?: string;
  summary?: string;
  keywords?: string[];
  created_at?: string;
  meta?: Record<string, unknown>;
};

const S: Record<string, React.CSSProperties> = {
  page: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main: { flex: 1, padding: '32px 36px', overflowY: 'auto' },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 12, color: 'var(--text2)', marginBottom: 28, fontFamily: 'JetBrains Mono, monospace' },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 10, cursor: 'pointer', transition: 'border-color 0.15s' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 },
};

function aiBadge(ai?: string) {
  const map: Record<string, { bg: string; color: string }> = {
    Claude:        { bg: '#1c2a3d', color: '#58A6FF' },
    ChatGPT:       { bg: '#1a2e1a', color: '#3FB950' },
    Gemini:        { bg: '#2d1f1f', color: '#F78166' },
    Perplexity:    { bg: '#2a1f2d', color: '#D2A8FF' },
    auto_detected: { bg: '#2a2a1f', color: '#F0883E' },
    manual:        { bg: '#1f2a2a', color: '#8B949E' },
  };
  const style = map[ai || ''] || { bg: 'var(--bg3)', color: 'var(--text2)' };
  return <span style={{ ...S.badge, background: style.bg, color: style.color }}>{ai || 'AI'}</span>;
}

export default function Snapshots() {
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Snapshot | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/hajun?action=snapshots&limit=30');
    const json = await res.json();
    setSnaps(json.payload || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div style={S.title}>📸 스냅샷</div>
        <div style={S.sub}>{loading ? '로딩 중...' : `${snaps.length}개의 저장된 AI 대화`}</div>

        <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 16 }}>
          {/* 목록 */}
          <div>
            {loading && <div style={{ color: 'var(--text2)', fontSize: 13 }}>⏳ 로딩 중...</div>}
            {!loading && snaps.length === 0 && (
              <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20, textAlign: 'center' }}>
                저장된 스냅샷 없음
              </div>
            )}
            {snaps.map(s => (
              <div key={s.id} style={{
                ...S.card,
                borderColor: selected?.id === s.id ? 'var(--accent)' : 'var(--border)',
              }} onClick={() => setSelected(selected?.id === s.id ? null : s)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', flex: 1, marginRight: 8,
                    overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {s.summary || s.original_message?.slice(0, 60) || '내용 없음'}
                  </div>
                  {aiBadge(s.source_ai)}
                </div>
                {s.keywords && s.keywords.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {s.keywords.slice(0, 4).map((k, i) => (
                      <span key={i} style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg3)',
                        borderRadius: 3, color: 'var(--text3)' }}>#{k}</span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
                  {s.created_at ? new Date(s.created_at).toLocaleString('ko-KR') : '-'}
                </div>
              </div>
            ))}
          </div>

          {/* 상세 */}
          {selected && (
            <div style={{ ...S.card, cursor: 'default', position: 'sticky', top: 0,
              maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {aiBadge(selected.source_ai)}
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {selected.created_at ? new Date(selected.created_at).toLocaleString('ko-KR') : '-'}
                  </span>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              {selected.summary && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6,
                  padding: 12, background: 'var(--bg3)', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6,
                    fontFamily: 'JetBrains Mono, monospace' }}>SUMMARY</div>
                  {selected.summary}
                </div>
              )}
              {selected.original_message && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6,
                    fontFamily: 'JetBrains Mono, monospace' }}>ORIGINAL MESSAGE</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace',
                    maxHeight: 400, overflowY: 'auto' }}>
                    {selected.original_message}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
