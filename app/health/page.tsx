'use client';
import { useEffect, useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';

type Context = {
  id: string;
  health_score?: number;
  phase?: string;
  status?: string;
  next_tasks?: string[];
  summary?: string;
  action_reasoning?: string;
  updated_at?: string;
};

const S: Record<string, React.CSSProperties> = {
  page: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main: { flex: 1, padding: '32px 36px', overflowY: 'auto' },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 12, color: 'var(--text2)', marginBottom: 28, fontFamily: 'JetBrains Mono, monospace' },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 16 },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 8, fontFamily: 'JetBrains Mono, monospace' },
};

function ScoreRing({ score }: { score: number }) {
  const r = 54;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  const color = score >= 80 ? '#3FB950' : score >= 50 ? '#F0883E' : '#F78166';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 32, marginBottom: 24 }}>
      <svg width={130} height={130} viewBox="0 0 130 130">
        <circle cx={65} cy={65} r={r} fill="none" stroke="var(--bg3)" strokeWidth={12} />
        <circle cx={65} cy={65} r={r} fill="none" stroke={color} strokeWidth={12}
          strokeDasharray={circ} strokeDashoffset={offset}
          strokeLinecap="round" transform="rotate(-90 65 65)"
          style={{ transition: 'stroke-dashoffset 0.6s ease' }}
        />
        <text x={65} y={60} textAnchor="middle" fill={color} fontSize={28} fontWeight={700} fontFamily="JetBrains Mono, monospace">{score}</text>
        <text x={65} y={78} textAnchor="middle" fill="var(--text3)" fontSize={11} fontFamily="Noto Sans KR, sans-serif">/ 100</text>
      </svg>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 4 }}>헬스 스코어</div>
        <div style={{ fontSize: 28, fontWeight: 700, color, fontFamily: 'JetBrains Mono, monospace' }}>{score >= 80 ? '🟢 양호' : score >= 50 ? '🟡 주의' : '🔴 위험'}</div>
      </div>
    </div>
  );
}

export default function Health() {
  const [ctx, setCtx] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/hajun?action=contexts');
    const json = await res.json();
    if (json.payload) setCtx(json.payload);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return (
    <div style={S.page}><Sidebar /><main style={S.main}><div style={{ color: 'var(--text2)', fontSize: 13 }}>⏳ 로딩 중...</div></main></div>
  );

  if (!ctx) return (
    <div style={S.page}><Sidebar /><main style={S.main}><div style={{ color: 'var(--warn)', fontSize: 13 }}>⚠️ 데이터 없음</div></main></div>
  );

  const tasks = Array.isArray(ctx.next_tasks) ? ctx.next_tasks : [];

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div style={S.title}>🩺 헬스 모니터</div>
        <div style={S.sub}>페이즈: {ctx.phase} · 상태: {ctx.status}</div>

        <div style={S.card}>
          <ScoreRing score={ctx.health_score ?? 0} />
          {ctx.summary && (
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {ctx.summary}
            </div>
          )}
        </div>

        {tasks.length > 0 && (
          <div style={S.card}>
            <div style={S.label}>🎯 다음 작업 ({tasks.length}개)</div>
            {tasks.map((t, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 0', borderBottom: i < tasks.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', fontSize: 11, minWidth: 24, marginTop: 1 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{t}</span>
              </div>
            ))}
          </div>
        )}

        {ctx.action_reasoning && (
          <div style={{ ...S.card, borderLeft: '4px solid var(--accent2)' }}>
            <div style={S.label}>💡 추론</div>
            <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{ctx.action_reasoning}</div>
          </div>
        )}

        <button onClick={load} style={{
          padding: '8px 16px', background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', color: 'var(--text2)', cursor: 'pointer',
          fontSize: 12, fontFamily: 'Noto Sans KR, sans-serif',
        }}>🔄 새로고침</button>
      </main>
    </div>
  );
}
