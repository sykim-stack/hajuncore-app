'use client';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Sidebar from '@/components/Sidebar';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  observations?: string[];
};

type ContextDraft = {
  last_task: string;
  summary: string;
  next_action: string;
  current_problems: string;
};

const S: Record<string, CSSProperties> = {
  page: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden' },
  header: { padding: '16px 28px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  title: { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  sub: { fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' },
  body: { flex: 1, display: 'flex', overflow: 'hidden' },
  messages: { flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  text: { fontSize: 13, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  obsBox: { marginTop: 10, padding: '8px 10px', background: 'rgba(63,185,80,0.07)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 6 },
  obsLabel: { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  obsItem: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, paddingLeft: 2 },
  inputArea: { padding: '12px 24px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  inputRow: { display: 'flex', gap: 10, alignItems: 'flex-end' },
  textarea: { flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 14px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1.5, minHeight: 44, maxHeight: 140 },
  sendBtn: { padding: '10px 18px', background: 'var(--accent)', color: '#0D1117', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif', flexShrink: 0, height: 44 },
  sendBtnDisabled: { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  hint: { fontSize: 10, color: 'var(--text3)', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' },
  thinking: { alignSelf: 'flex-start', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', padding: '4px 0' },
  // 맥락 패널
  panel: { width: 300, borderLeft: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' },
  panelHeader: { padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { fontSize: 12, fontWeight: 700, color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace' },
  panelBody: { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 },
  fieldLabel: { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 4 },
  fieldInput: { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'Noto Sans KR, sans-serif', boxSizing: 'border-box' },
  fieldTextarea: { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1.5, boxSizing: 'border-box' },
  analyzeBtn: { width: '100%', padding: '9px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  saveBtn: { width: '100%', padding: '9px', background: 'var(--accent2)', border: 'none', borderRadius: 7, color: '#0D1117', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  saveBtnDisabled: { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  statusMsg: { fontSize: 11, textAlign: 'center', padding: '4px 0', fontFamily: 'JetBrains Mono, monospace' },
};

function bubbleStyle(role: 'user' | 'assistant'): CSSProperties {
  return {
    maxWidth: '80%',
    alignSelf: role === 'user' ? 'flex-end' : 'flex-start',
    background: role === 'user' ? 'rgba(88,166,255,0.12)' : 'var(--bg2)',
    border: role === 'user' ? '1px solid rgba(88,166,255,0.3)' : '1px solid var(--border)',
    borderRadius: role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
    padding: '10px 14px',
  };
}

function roleLabelStyle(role: 'user' | 'assistant'): CSSProperties {
  return {
    fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
    color: role === 'user' ? 'var(--accent)' : 'var(--accent2)',
    fontFamily: 'JetBrains Mono, monospace', marginBottom: 4,
  };
}

const INIT_MESSAGE: Message = {
  role: 'assistant',
  content: '안녕하세요. 프로젝트 상태나 다음 작업에 대해 물어보세요.\n맥락(contexts)과 씨앗 상태(MindWorld)를 읽고 답합니다.',
};

const EMPTY_DRAFT: ContextDraft = { last_task: '', summary: '', next_action: '', current_problems: '' };

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([INIT_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ContextDraft>(EMPTY_DRAFT);
  const [hasDraft, setHasDraft] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  };

  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;

    const userMsg: Message = { role: 'user', content: msg };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '44px';
    setLoading(true);

    const history = nextMessages.slice(1).slice(-10).map((m) => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/hajun?action=chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, history }),
      });
      const json = await res.json();
      if (json._error) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `오류: ${json._error}` }]);
      } else {
        setMessages((prev) => [...prev, {
          role: 'assistant',
          content: json.reply || '(응답 없음)',
          observations: Array.isArray(json.observations) && json.observations.length > 0 ? json.observations : undefined,
        }]);
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `네트워크 오류: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ── 맥락 요약 실행 ──────────────────────────────────────────
  const analyzeContext = async () => {
    setAnalyzing(true);
    setStatusMsg('');
    try {
      const res = await fetch('/api/hajun?action=summarize_context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json._error) {
        setStatusMsg(`❌ ${json._error}`);
      } else {
        setDraft(json.summary);
        setHasDraft(true);
        setStatusMsg('✅ 분석 완료 — 내용 확인 후 저장하세요');
      }
    } catch (e) {
      setStatusMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAnalyzing(false);
    }
  };

  // ── contexts 저장 ────────────────────────────────────────────
  const saveContext = async () => {
    setSaving(true);
    setStatusMsg('');
    try {
      // contexts id 먼저 가져오기
      const ctxRes = await fetch('/api/hajun?action=contexts');
      const ctxJson = await ctxRes.json();
      const id = ctxJson.payload?.id;
      if (!id) { setStatusMsg('❌ contexts ID 없음'); return; }

      const res = await fetch('/api/hajun?action=update_context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      });
      const json = await res.json();
      if (json._error) {
        setStatusMsg(`❌ ${json._error}`);
      } else {
        setStatusMsg('✅ contexts 저장 완료');
        setHasDraft(false);
      }
    } catch (e) {
      setStatusMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        {/* 헤더 */}
        <div style={S.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={S.title}>🧠 HajunAI</div>
              <div style={S.sub}>contexts + MindWorld 기반 전략 비서</div>
            </div>
            <button
              onClick={() => setMessages([INIT_MESSAGE])}
              style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace' }}
            >
              대화 초기화
            </button>
          </div>
        </div>

        <div style={S.body}>
          {/* 채팅 영역 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={S.messages}>
              {messages.map((m, i) => (
                <div key={i} style={bubbleStyle(m.role)}>
                  <div style={roleLabelStyle(m.role)}>{m.role === 'user' ? '나' : 'HajunAI'}</div>
                  <div style={S.text}>{m.content}</div>
                  {m.observations && m.observations.length > 0 && (
                    <div style={S.obsBox}>
                      <div style={S.obsLabel}>관찰</div>
                      {m.observations.map((obs, j) => (
                        <div key={j} style={{ ...S.obsItem, marginBottom: j < (m.observations as string[]).length - 1 ? 4 : 0 }}>
                          · {obs}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {loading && <div style={S.thinking}>HajunAI가 생각 중...</div>}
              <div ref={bottomRef} />
            </div>

            <div style={S.inputArea}>
              <div style={S.inputRow}>
                <textarea
                  ref={textareaRef}
                  style={S.textarea}
                  placeholder="질문을 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)"
                  value={input}
                  onChange={handleInput}
                  onKeyDown={onKeyDown}
                  rows={1}
                  disabled={loading}
                />
                <button
                  style={{ ...S.sendBtn, ...(loading || !input.trim() ? S.sendBtnDisabled : {}) }}
                  onClick={send}
                  disabled={loading || !input.trim()}
                >
                  전송
                </button>
              </div>
              <div style={S.hint}>세션 대화는 최근 10턴 유지 · 저장: hajunai_conversations</div>
            </div>
          </div>

          {/* 맥락 갱신 패널 */}
          <div style={S.panel}>
            <div style={S.panelHeader}>
              <span style={S.panelTitle}>⚙ 맥락 갱신</span>
            </div>
            <div style={S.panelBody}>
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
                전체 대화를 Gemini가 읽고 contexts를 요약합니다. 내용 확인 후 저장하세요.
              </div>

              <button
                style={{ ...S.analyzeBtn, ...(analyzing ? S.saveBtnDisabled : {}) }}
                onClick={analyzeContext}
                disabled={analyzing}
              >
                {analyzing ? '⏳ 분석 중...' : '🔍 맥락 요약 실행'}
              </button>

              {hasDraft && (
                <>
                  <div>
                    <div style={S.fieldLabel}>마지막 작업</div>
                    <input
                      style={S.fieldInput}
                      value={draft.last_task}
                      onChange={(e) => setDraft((d) => ({ ...d, last_task: e.target.value }))}
                    />
                  </div>
                  <div>
                    <div style={S.fieldLabel}>요약</div>
                    <textarea
                      style={{ ...S.fieldTextarea, minHeight: 70 }}
                      value={draft.summary}
                      onChange={(e) => setDraft((d) => ({ ...d, summary: e.target.value }))}
                    />
                  </div>
                  <div>
                    <div style={S.fieldLabel}>다음 액션</div>
                    <input
                      style={S.fieldInput}
                      value={draft.next_action}
                      onChange={(e) => setDraft((d) => ({ ...d, next_action: e.target.value }))}
                    />
                  </div>
                  <div>
                    <div style={S.fieldLabel}>현재 문제</div>
                    <input
                      style={S.fieldInput}
                      value={draft.current_problems}
                      onChange={(e) => setDraft((d) => ({ ...d, current_problems: e.target.value }))}
                    />
                  </div>

                  <button
                    style={{ ...S.saveBtn, ...(saving ? S.saveBtnDisabled : {}) }}
                    onClick={saveContext}
                    disabled={saving}
                  >
                    {saving ? '⏳ 저장 중...' : '💾 contexts 저장'}
                  </button>
                </>
              )}

              {statusMsg && (
                <div style={{ ...S.statusMsg, color: statusMsg.startsWith('✅') ? 'var(--accent2)' : 'var(--warn)' }}>
                  {statusMsg}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}