'use client';
import { useEffect, useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import type { KnowledgeUnit } from '@/types/hajunai';

const S: Record<string, React.CSSProperties> = {
  page:  { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main:  { flex: 1, padding: 'var(--page-py) var(--page-px)', overflowY: 'auto', minWidth: 0 },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sub:   { fontSize: 12, color: 'var(--text2)', marginBottom: 28, fontFamily: 'JetBrains Mono, monospace' },
  card:  { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 10, cursor: 'pointer', transition: 'border-color 0.15s' },
  badge: { display: 'inline-block', padding: '2px 8px', borderRadius: 4, fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
};

function aiBadge(ai?: string) {
  const map: Record<string, { bg: string; color: string }> = {
    Claude:        { bg: '#1c2a3d', color: '#58A6FF' },
    ChatGPT:       { bg: '#1a2e1a', color: '#3FB950' },
    Gemini:        { bg: '#2d1f1f', color: '#F78166' },
    Perplexity:    { bg: '#2a1f2d', color: '#D2A8FF' },
    HajunAI:       { bg: '#1f2a1f', color: '#3FB950' },
    manual:        { bg: '#1f2a2a', color: '#8B949E' },
  };
  const style = map[ai || ''] || { bg: 'var(--bg3)', color: 'var(--text2)' };
  return <span style={{ ...S.badge, background: style.bg, color: style.color }}>{ai || 'AI'}</span>;
}

function typeBadge(type?: string | null) {
  if (!type || type === 'raw') return null;
  const map: Record<string, string> = {
    language: '#58A6FF', context: '#3FB950', life: '#D2A8FF', pattern: '#F0883E',
  };
  return (
    <span style={{ ...S.badge, background: 'var(--bg3)', color: map[type] || 'var(--text2)', marginLeft: 4 }}>
      {type}
    </span>
  );
}

export default function Snapshots() {
  const [snaps, setSnaps]       = useState<KnowledgeUnit[]>([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState<KnowledgeUnit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res  = await fetch('/api/hajun?action=snapshots&limit=30');
    const json = await res.json();
    setSnaps(json.payload || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div className="mobile-header-space" />
        <div style={S.title}>📸 스냅샷</div>
        <div style={S.sub}>{loading ? '로딩 중...' : `${snaps.length}개의 저장된 Knowledge Unit`}</div>

        <div className="snapshots-grid">
          {/* 목록 */}
          <div>
            {loading && <div style={{ color: 'var(--text2)', fontSize: 13 }}>⏳ 로딩 중...</div>}
            {!loading && snaps.length === 0 && (
              <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20, textAlign: 'center' }}>저장된 스냅샷 없음</div>
            )}
            {snaps.map(s => (
              <div key={s.id}
                style={{ ...S.card, borderColor: selected?.id === s.id ? 'var(--accent)' : 'var(--border)' }}
                onClick={() => setSelected(selected?.id === s.id ? null : s)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, flexWrap: 'wrap', gap: 4 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--text)', flex: 1, marginRight: 8, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {s.summary || s.original_message?.slice(0, 60) || '내용 없음'}
                  </div>
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {aiBadge(s.source_ai)}
                    {typeBadge(s.knowledge_type)}
                  </div>
                </div>
                {s.keywords && s.keywords.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 6 }}>
                    {s.keywords.slice(0, 4).map((k, i) => (
                      <span key={i} style={{ fontSize: 10, padding: '1px 6px', background: 'var(--bg3)', borderRadius: 3, color: 'var(--text3)' }}>#{k}</span>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {s.created_at ? new Date(s.created_at).toLocaleString('ko-KR') : '-'}
                  </span>
                  {s.confidence && (
                    <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
                      conf: {s.confidence.toFixed(2)}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 상세 */}
          {selected && (
            <div style={{ ...S.card, cursor: 'default', position: 'sticky', top: 16, maxHeight: 'calc(100vh - 80px)', overflowY: 'auto' }}
              className="detail-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {aiBadge(selected.source_ai)}
                  {typeBadge(selected.knowledge_type)}
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
                    {selected.created_at ? new Date(selected.created_at).toLocaleString('ko-KR') : '-'}
                  </span>
                </div>
                <button onClick={() => setSelected(null)}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16 }}>✕</button>
              </div>

              {/* ADR-K04 메타데이터 표시 */}
              {(selected.derived_by || selected.derived_version) && (
                <div style={{ background: 'var(--bg3)', borderRadius: 6, padding: '8px 12px', marginBottom: 12, fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
                  Derived by: {selected.derived_by || '-'} · v{selected.derived_version || '-'}
                  {selected.confidence && ` · conf: ${selected.confidence.toFixed(2)}`}
                </div>
              )}

              {selected.summary && (
                <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.6, padding: 12, background: 'var(--bg3)', borderRadius: 6 }}>
                  <div style={{ ...S.label, marginBottom: 6 }}>SUMMARY</div>
                  {selected.summary}
                </div>
              )}
              {selected.original_message && (
                <div>
                  <div style={S.label}>ORIGINAL MESSAGE</div>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontFamily: 'JetBrains Mono, monospace', maxHeight: 400, overflowY: 'auto' }}>
                    {selected.original_message}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <style>{`
        .mobile-header-space { height: 0; }
        .snapshots-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .detail-panel { display: block; }
        @media (max-width: 900px) {
          .snapshots-grid { grid-template-columns: 1fr !important; }
          .detail-panel {
            position: fixed !important;
            bottom: 0 !important; left: 0 !important; right: 0 !important;
            top: auto !important;
            max-height: 60vh !important;
            border-radius: var(--radius) var(--radius) 0 0 !important;
            z-index: 80;
          }
        }
        @media (max-width: 768px) {
          .mobile-header-space { height: 48px !important; }
        }
      `}</style>
    </div>
  );
}