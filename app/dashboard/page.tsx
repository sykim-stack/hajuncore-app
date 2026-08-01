'use client';
import { useEffect, useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';
import type { DevContext, DevContextSummary } from '@/types/hajunai';

const AI_PROJECTS = [
  { label: 'HajunAI',  id: 'aaaaaaaa-0000-0000-0000-000000000001', color: '#58A6FF' },
  { label: 'CoreNull', id: 'aaaaaaaa-0000-0000-0000-000000000003', color: '#3FB950' },
  { label: 'CoreRing', id: 'aaaaaaaa-0000-0000-0000-000000000005', color: '#F78166' },
];

const S: Record<string, React.CSSProperties> = {
  page:     { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main:     { flex: 1, padding: 'var(--page-py) var(--page-px)', overflowY: 'auto', minWidth: 0 },
  title:    { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sub:      { fontSize: 12, color: 'var(--text2)', marginBottom: 16, fontFamily: 'JetBrains Mono, monospace' },
  card:     { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 },
  infoCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 12 },
  label:    { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' },
  input:    { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'Noto Sans KR, sans-serif' },
  textarea: { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 12, outline: 'none', fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' as const },
  btn:      { padding: '10px 20px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'Noto Sans KR, sans-serif' },
  promptBox:{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, fontSize: 12, whiteSpace: 'pre-wrap' as const, fontFamily: 'JetBrains Mono, monospace', maxHeight: 320, overflowY: 'auto' as const },
  infoText: { fontSize: 13, color: 'var(--text)', lineHeight: 1.7 },
};

function formatList(val: unknown): string {
  if (!val) return '정보 없음';
  if (Array.isArray(val)) return val.join('\n');
  return String(val);
}

function InfoCard({ icon, label, content, accent }: {
  icon: string; label: string; content: string; accent?: string;
}) {
  if (!content || content === '없음' || content === '정보 없음') return null;
  return (
    <div style={{ ...S.infoCard, borderLeft: `4px solid ${accent || 'var(--border)'}` }}>
      <div style={{ ...S.label, marginBottom: 8 }}>{icon} {label}</div>
      <div style={S.infoText}>{content}</div>
    </div>
  );
}

function buildPrompt(c: DevContext, projectLabel: string): string {
  return `🦈 BRAINPOOL OS - ${projectLabel} 맥락 주입

당신은 BRAINPOOL OS 에이전트입니다. 아래 맥락을 완벽히 이해하고 이어서 작업해주세요.

=== 📊 현재 프로젝트 상태 ===
페이즈: ${c.phase || '미확인'}
상태: ${c.status || '미확인'}
진행 중인 작업: ${c.last_task || '미확인'}
다음 액션: ${c.next_action || '미확인'}
현재 문제: ${c.current_problems || '없음'}

=== 📈 개발 진행 상황 ===
${c.development_summary || '정보 없음'}

=== 💬 최근 논의 ===
${c.conversation_summary || '정보 없음'}

=== ✅ 확정된 결정 ===
${c.decisions || '없음'}

=== ⚠️ 주의 사항 ===
${c.risks || '없음'}

=== 📦 스택 & 핵심 파일 ===
스택: ${c.stack || '정보 없음'}
아키텍처: ${c.architecture || '정보 없음'}
핵심 파일:
${formatList(c.key_files)}

=== ✅ 완료된 작업 ===
${formatList(c.completed_tasks)}

=== 🎯 다음 작업 ===
${formatList(c.next_tasks)}

=== 📜 BRAINPOOL 계약서 준수 ===
- 모든 함수는 (ctx) => ctx 형태
- throw 절대 금지, _error 필드만 사용
- Core Independence: 다른 Core 영역 침범 금지`;
}

export default function Dashboard() {
  const [selectedAI, setSelectedAI] = useState(AI_PROJECTS[0]);
  const [ctx, setCtx] = useState<DevContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/hajun?action=dev_contexts&project_id=${encodeURIComponent(selectedAI.id)}`,
        { cache: 'no-store' }
      );
      const json = await res.json();
      if (json.payload) {
        setCtx(json.payload);
        setPrompt(buildPrompt(json.payload, selectedAI.label));
      } else {
        setCtx(null);
        setPrompt('');
      }
    } catch {
      setCtx(null);
      setPrompt('');
    }
    setLoading(false);
  }, [selectedAI]);

  useEffect(() => { load(); }, [load]);

  const update = (field: keyof DevContext, value: unknown) => {
    setCtx(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      setPrompt(buildPrompt(updated, selectedAI.label));
      return updated;
    });
  };

  const save = async () => {
    if (!ctx?.id) return;
    setSaving(true);
    try {
      const res = await fetch('/api/hajun?action=update_context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...ctx }),
      });
      const json = await res.json();
      setMsg(json._error ? `❌ ${json._error}` : '✅ 저장 완료');
    } catch (e) {
      setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
    setSaving(false);
    setTimeout(() => setMsg(''), 3000);
  };

  const summarize = async () => {
    if (!ctx?.id) return;
    setSummarizing(true);
    setMsg('⏳ Gemini 분석 중...');
    try {
      const res = await fetch('/api/hajun?action=summarize_context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const json = await res.json();
      if (json._error) { setMsg(`❌ ${json._error}`); return; }
      const s = json.summary as DevContextSummary;
      const patch = await fetch('/api/hajun?action=update_context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ctx.id, ...s }),
      });
      const patchJson = await patch.json();
      if (patchJson._error) { setMsg(`❌ 저장 실패: ${patchJson._error}`); return; }
      setCtx(prev => {
        if (!prev) return prev;
        const updated = { ...prev, ...s };
        setPrompt(buildPrompt(updated, selectedAI.label));
        return updated;
      });
      setMsg('✅ Gemini 요약 완료 & 저장됨');
    } catch (e) {
      setMsg(`❌ 오류: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSummarizing(false);
      setTimeout(() => setMsg(''), 4000);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div style={{ height: 0 }} className="mobile-header-space" />

        <div style={S.title}>🎯 대시보드</div>
        <div style={S.sub}>
          마지막 업데이트: {ctx?.updated_at ? new Date(ctx.updated_at).toLocaleString('ko-KR') : '-'}
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
          {AI_PROJECTS.map(ai => (
            <button
              key={ai.id}
              onClick={() => setSelectedAI(ai)}
              style={{
                padding: '6px 16px',
                borderRadius: 'var(--radius)',
                border: '1px solid',
                borderColor: selectedAI.id === ai.id ? ai.color : 'var(--border)',
                background: selectedAI.id === ai.id ? ai.color + '22' : 'var(--bg2)',
                color: selectedAI.id === ai.id ? ai.color : 'var(--text2)',
                fontWeight: selectedAI.id === ai.id ? 700 : 400,
                fontSize: 12,
                cursor: 'pointer',
                fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {ai.label}
            </button>
          ))}
        </div>

        {loading && (
          <div style={{ color: 'var(--text2)', fontSize: 13, paddingTop: 24 }}>⏳ 로딩 중...</div>
        )}

        {!loading && !ctx && (
          <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20 }}>
            {selectedAI.label} 맥락 없음 — dev_contexts에 해당 project_id row가 없습니다.
          </div>
        )}

        {!loading && ctx && (
          <>
            <div style={{ marginBottom: 24 }}>
              <InfoCard icon="📌" label="Development Summary" content={ctx.development_summary || ''} accent="var(--accent)" />
              <InfoCard icon="💬" label="Conversation Summary" content={ctx.conversation_summary || ''} accent="var(--accent2)" />
              <InfoCard icon="✅" label="Decisions" content={ctx.decisions || ''} accent="#3FB950" />
              <InfoCard icon="⚠️" label="Risks" content={ctx.risks || ''} accent="var(--warn)" />
              {!ctx.development_summary && (
                <div style={{ ...S.infoCard, borderLeft: '4px solid var(--text3)', color: 'var(--text3)', fontSize: 12 }}>
                  Gemini 요약을 실행하면 개발 현황이 여기에 표시됩니다.
                </div>
              )}
            </div>

            <div className="dashboard-grid" style={{ marginBottom: 24 }}>
              <div style={S.card}>
                <div style={S.label}>페이즈</div>
                <input style={S.input} value={ctx.phase || ''} onChange={e => update('phase', e.target.value)} />
              </div>
              <div style={S.card}>
                <div style={S.label}>상태</div>
                <input style={S.input} value={ctx.status || ''} onChange={e => update('status', e.target.value)} />
              </div>
              <div style={S.card}>
                <div style={S.label}>진행 중인 작업</div>
                <input style={S.input} value={ctx.last_task || ''} onChange={e => update('last_task', e.target.value)} />
              </div>
              <div style={S.card}>
                <div style={S.label}>다음 액션</div>
                <input style={S.input} value={ctx.next_action || ''} onChange={e => update('next_action', e.target.value)} />
              </div>
              <div style={{ ...S.card, gridColumn: 'span 2' }} className="full-width-card">
                <div style={S.label}>현재 문제</div>
                <input style={S.input} value={ctx.current_problems || ''} onChange={e => update('current_problems', e.target.value)} />
              </div>
              <div style={{ ...S.card, gridColumn: 'span 2' }} className="full-width-card">
                <div style={S.label}>다음 작업 (줄바꿈으로 구분)</div>
                <textarea
                  style={{ ...S.textarea, minHeight: 80 }}
                  value={Array.isArray(ctx.next_tasks) ? ctx.next_tasks.join('\n') : (ctx.next_tasks || '')}
                  onChange={e => update('next_tasks', e.target.value.split('\n').filter(Boolean))}
                />
              </div>
              <div style={{ ...S.card, gridColumn: 'span 2' }} className="full-width-card">
                <div style={S.label}>완료된 작업 (줄바꿈으로 구분)</div>
                <textarea
                  style={{ ...S.textarea, minHeight: 80 }}
                  value={Array.isArray(ctx.completed_tasks) ? ctx.completed_tasks.join('\n') : (ctx.completed_tasks || '')}
                  onChange={e => update('completed_tasks', e.target.value.split('\n').filter(Boolean))}
                />
              </div>
            </div>

            <div className="btn-row" style={{ marginBottom: 28 }}>
              <button style={{ ...S.btn, background: 'var(--accent)', color: '#0D1117' }} onClick={save} disabled={saving}>
                {saving ? '⏳ 저장 중...' : '💾 Supabase 저장'}
              </button>
              <button
                style={{
                  ...S.btn,
                  background: summarizing ? 'var(--bg3)' : 'var(--accent2)',
                  color: summarizing ? 'var(--text2)' : '#0D1117',
                }}
                onClick={summarize}
                disabled={summarizing}
              >
                {summarizing ? '⏳ 분석 중...' : '✨ Gemini 요약 실행'}
              </button>
              {msg && (
                <span style={{
                  fontSize: 12,
                  color: msg.startsWith('✅') ? 'var(--accent2)' : msg.startsWith('⏳') ? 'var(--text2)' : 'var(--warn)',
                }}>
                  {msg}
                </span>
              )}
            </div>

            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>📋 이어가기 프롬프트</div>
                <button
                  style={{
                    ...S.btn,
                    background: copied ? 'var(--accent2)' : 'var(--bg3)',
                    color: copied ? '#0D1117' : 'var(--accent)',
                    border: '1px solid var(--accent)',
                    padding: '6px 14px',
                    fontSize: 12,
                  }}
                  onClick={copy}
                >
                  {copied ? '✅ 복사됨!' : '📋 복사'}
                </button>
              </div>
              <div style={S.promptBox}>{prompt}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>
                Claude / ChatGPT 채팅창에 붙여넣으세요 · context_package: /api/hajun?action=context_package&agent=clo3
              </div>
            </div>
          </>
        )}
      </main>

      <style>{`
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .btn-row {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        @media (max-width: 768px) {
          .mobile-header-space { height: 48px !important; }
          .dashboard-grid { grid-template-columns: 1fr !important; }
          .full-width-card { grid-column: span 1 !important; }
          .btn-row button { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  );
}
