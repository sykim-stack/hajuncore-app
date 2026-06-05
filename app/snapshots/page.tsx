'use client';
import { useEffect, useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';

type Snapshot = {
  id: string;
  title?: string;
  summary?: string;
  ai_type?: string;
  created_at?: string;
  content?: string;
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
    Claude:     { bg: '#1c2a3d', color: '#58A6FF' },
    ChatGPT:    { bg: '#1a2e1a', color: '#3FB950' },
    Gemini:     { bg: '#2d1f1f', color: '#F78166' },
    Perplexity: { bg: '#2a1f2d', color: '#D2A8FF' },
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
                저장된 스냅샷 없음<br />
                <span style={{ fontSize: 11, marginTop: 8, display: 'block' }}>Extension에서 AI 대화를 저장하면 여기에 나타납니다</span>
              </div>
            )}
            {snaps.map(s => (
              <div key={s.id} style={{
                ...S.card,
                borderColor: selected?.id === s.id ? 'var(--accent)' : 'var(--border)',
              }} onClick={() => setSelected(selected?.id === s.id ? null : s)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{s.title || '제목 없음'}</div>
                  {aiBadge(s.ai_type)}
                </div>
                {s.summary && (
                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 6,
                    overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>
                    {s.summary}
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
            <div style={{ ...S.card, cursor: 'default', position: 'sticky', top: 0, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{selected.title || '제목 없음'}</div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>
              {selected.summary && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6, padding: 12, background: 'var(--bg3)', borderRadius: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' }}>SUMMARY</div>
                  {selected.summary}
                </div>
              )}
              {selected.content && (
                <div>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' }}>CONTENT</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace' }}>
                    {selected.content}
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
