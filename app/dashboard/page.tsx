'use client';
import { useEffect, useState, useCallback } from 'react';
import Sidebar from '@/components/Sidebar';

type Context = {
  id: string;
  project_id?: string;
  phase?: string;
  status?: string;
  health_score?: number;
  last_task?: string;
  next_action?: string;
  current_problems?: string;
  architecture?: string;
  stack?: string;
  key_files?: string[];
  completed_tasks?: string[];
  next_tasks?: string[];
  summary?: string;
  updated_at?: string;
};

const AI_PROJECTS = [
  { label: 'Claude',     id: 'aaaaaaaa-0000-0000-0000-000000000001', color: '#58A6FF' },
  { label: 'ChatGPT',    id: 'aaaaaaaa-0000-0000-0000-000000000002', color: '#3FB950' },
  { label: 'Gemini',     id: 'aaaaaaaa-0000-0000-0000-000000000003', color: '#F78166' },
  { label: 'Perplexity', id: 'aaaaaaaa-0000-0000-0000-000000000004', color: '#D2A8FF' },
];

const S: Record<string, React.CSSProperties> = {
  page: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main: { flex: 1, padding: '32px 36px', overflowY: 'auto' },
  title: { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sub: { fontSize: 12, color: 'var(--text2)', marginBottom: 16, fontFamily: 'JetBrains Mono, monospace' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 },
  card: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16 },
  label: { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' },
  input: { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 13, outline: 'none', fontFamily: 'Noto Sans KR, sans-serif' },
  textarea: { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '8px 12px', fontSize: 12, outline: 'none', fontFamily: 'JetBrains Mono, monospace', resize: 'vertical' as const },
  btn: { padding: '10px 20px', borderRadius: 'var(--radius)', border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 13, fontFamily: 'Noto Sans KR, sans-serif' },
  promptBox: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, fontSize: 12, whiteSpace: 'pre-wrap' as const, fontFamily: 'JetBrains Mono, monospace', maxHeight: 320, overflowY: 'auto' as const },
};

function formatList(val: unknown): string {
  if (!val) return '정보 없음';
  if (Array.isArray(val)) return val.join('\n');
  return String(val);
}

function buildPrompt(c: Context): string {
  return `🦈 BRAINPOOL OS - HajunAI 맥락 주입 (v0.9)

당신은 BRAINPOOL OS의 핵심 개발자입니다. 아래 맥락을 완벽히 이해하고 이어서 작업해주세요.

=== 📊 현재 프로젝트 상태 ===
페이즈: ${c.phase || '미확인'}
상태: ${c.status || '미확인'}
헬스스코어: ${c.health_score ?? '?'}
진행 중인 작업: ${c.last_task || '미확인'}
다음 액션: ${c.next_action || '미확인'}
현재 문제: ${c.current_problems || '없음'}

=== 🏗️ 아키텍처 ===
${c.architecture || '정보 없음'}

=== 📦 스택 & 핵심 파일 ===
스택: ${c.stack || '정보 없음'}
핵심 파일:
${formatList(c.key_files)}

=== ✅ 완료된 작업 ===
${formatList(c.completed_tasks)}

=== 🎯 다음 작업 ===
${formatList(c.next_tasks)}

=== 📜 BRAINPOOL 계약서 준수 ===
- 모든 함수는 (ctx) => ctx 형태
- throw 절대 금지, _error 필드만 사용`;
}

export default function Dashboard() {
  const [selectedAI, setSelectedAI] = useState(AI_PROJECTS[0]);
  const [ctx, setCtx] = useState<Context | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/hajun?action=contexts&project_id=' + selectedAI.id);
    const json = await res.json();
    if (json.payload) {
      setCtx(json.payload);
      setPrompt(buildPrompt(json.payload));
    } else {
      setCtx(null);
      setPrompt('');
    }
    setLoading(false);
  }, [selectedAI]);

  useEffect(() => { load(); }, [load]);

  const update = (field: keyof Context, value: unknown) => {
    setCtx(prev => {
      if (!prev) return prev;
      const updated = { ...prev, [field]: value };
      setPrompt(buildPrompt(updated));
      return updated;
    });
  };

  const save = async () => {
    if (!ctx?.id) return;
    setSaving(true);
    const res = await fetch('/api/hajun?action=update_context', {
      method: 'POST',
      body: JSON.stringify(ctx),
    });
    const json = await res.json();
    setSaving(false);
    setMsg(json._error ? `❌ ${json._error}` : '✅ 저장 완료');
    setTimeout(() => setMsg(''), 3000);
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
        <div style={S.title}>🎯 대시보드</div>
        <div style={S.sub}>마지막 업데이트: {ctx?.updated_at ? new Date(ctx.updated_at).toLocaleString('ko-KR') : '-'}</div>

        {/* AI 탭 선택 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
          {AI_PROJECTS.map(ai => (
            <button
              key={ai.id}
              onClick={() => setSelectedAI(ai)}
              style={{
                padding: '6px 16px', borderRadius: 'var(--radius)', border: '1px solid',
                borderColor: selectedAI.id === ai.id ? ai.color : 'var(--border)',
                background: selectedAI.id === ai.id ? ai.color + '22' : 'var(--bg2)',
                color: selectedAI.id === ai.id ? ai.color : 'var(--text2)',
                fontWeight: selectedAI.id === ai.id ? 700 : 400,
                fontSize: 12, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
              }}
            >
              {ai.label}
            </button>
          ))}
        </div>

        {loading && <div style={{ color: 'var(--text2)', fontSize: 13 }}>⏳ 로딩 중...</div>}

        {!loading && !ctx && (
          <div style={{ color: 'var(--text3)', fontSize: 13, padding: 20 }}>
            {selectedAI.label} 맥락 없음 — 아직 저장된 대화가 없습니다.
          </div>
        )}

        {!loading && ctx && (
          <>
            <div style={S.grid}>
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
              <div style={{ ...S.card, gridColumn: '1 / -1' }}>
                <div style={S.label}>현재 문제</div>
                <input style={S.input} value={ctx.current_problems || ''} onChange={e => update('current_problems', e.target.value)} />
              </div>
              <div style={{ ...S.card, gridColumn: '1 / -1' }}>
                <div style={S.label}>다음 작업 (줄바꿈으로 구분)</div>
                <textarea style={{ ...S.textarea, minHeight: 80 }}
                  value={Array.isArray(ctx.next_tasks) ? ctx.next_tasks.join('\n') : (ctx.next_tasks || '')}
                  onChange={e => update('next_tasks', e.target.value.split('\n').filter(Boolean))}
                />
              </div>
              <div style={{ ...S.card, gridColumn: '1 / -1' }}>
                <div style={S.label}>완료된 작업 (줄바꿈으로 구분)</div>
                <textarea style={{ ...S.textarea, minHeight: 80 }}
                  value={Array.isArray(ctx.completed_tasks) ? ctx.completed_tasks.join('\n') : (ctx.completed_tasks || '')}
                  onChange={e => update('completed_tasks', e.target.value.split('\n').filter(Boolean))}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginBottom: 28, alignItems: 'center' }}>
              <button style={{ ...S.btn, background: 'var(--accent)', color: '#0D1117' }} onClick={save} disabled={saving}>
                {saving ? '⏳ 저장 중...' : '💾 Supabase 저장'}
              </button>
              {msg && <span style={{ fontSize: 12, color: msg.startsWith('✅') ? 'var(--accent2)' : 'var(--warn)' }}>{msg}</span>}
            </div>

            <div style={S.card}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>📋 이어가기 프롬프트</div>
                <button style={{ ...S.btn, background: copied ? 'var(--accent2)' : 'var(--bg3)', color: copied ? '#0D1117' : 'var(--accent)', border: '1px solid var(--accent)', padding: '6px 14px', fontSize: 12 }} onClick={copy}>
                  {copied ? '✅ 복사됨!' : '📋 복사'}
                </button>
              </div>
              <div style={S.promptBox}>{prompt}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>Claude / ChatGPT 채팅창에 붙여넣으세요</div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}


