// app/chat/page.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Sidebar from '@/components/Sidebar';

type ChatMode = 'control' | 'dev';

type Message = {
  role: 'user' | 'assistant';
  content: string;
  observations?: string[];
  devMeta?: {
  bestSource: string;
  judgedBy: string;
  participants: string[];
  failed: string[];
  rawResponses?: { name: string; text?: string; error?: string }[];
  };
};

type ContextDraft = {
  last_task: string;
  summary: string;
  next_action: string;
  current_problems: string;
};

const STORAGE_KEY = 'hajunai_chat_messages';
const S: Record<string, CSSProperties> = {
  page:        { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main:        { flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden', minWidth: 0 },
  header:      { padding: '16px 28px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  title:       { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  sub:         { fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' },
  body:        { flex: 1, display: 'flex', overflow: 'hidden' },
  messages:    { flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  text:        { fontSize: 13, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  obsBox:      { marginTop: 10, padding: '8px 10px', background: 'rgba(63,185,80,0.07)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 6 },
  obsLabel:    { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  obsItem:     { fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, paddingLeft: 2 },
  devMetaBox:  { marginTop: 10, padding: '8px 10px', background: 'rgba(210,168,255,0.07)', border: '1px solid rgba(210,168,255,0.2)', borderRadius: 6 },
  devMetaLabel:{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#D2A8FF', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  devMetaItem: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.6 },
  inputArea:   { padding: '12px 24px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  inputRow:    { display: 'flex', gap: 10, alignItems: 'flex-end' },
  textarea:    { flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 14px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1.5, minHeight: 44, maxHeight: 140 },
  sendBtn:     { padding: '10px 18px', background: 'var(--accent)', color: '#0D1117', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif', flexShrink: 0, height: 44 },
  sendBtnOff:  { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  hint:        { fontSize: 10, color: 'var(--text3)', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' },
  thinking:    { alignSelf: 'flex-start', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', padding: '4px 0' },
  panel:       { width: 300, borderLeft: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' },
  panelHeader: { padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle:  { fontSize: 12, fontWeight: 700, color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace' },
  panelBody:   { padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 },
  fieldLabel:  { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 4 },
  fieldInput:  { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'Noto Sans KR, sans-serif', boxSizing: 'border-box' },
  fieldTA:     { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1.5, boxSizing: 'border-box' },
  analyzeBtn:  { width: '100%', padding: '9px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text2)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  saveBtn:     { width: '100%', padding: '9px', background: 'var(--accent2)', border: 'none', borderRadius: 7, color: '#0D1117', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  saveBtnOff:  { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  statusMsg:   { fontSize: 11, textAlign: 'center', padding: '4px 0', fontFamily: 'JetBrains Mono, monospace' },
  clearBtn:    { background: 'none', border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: 6, padding: '4px 10px', fontSize: 11, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace' },
  modeToggle:  { display: 'flex', background: 'var(--bg3)', borderRadius: 8, padding: 3, gap: 2 },
  modeBtn:     { padding: '6px 14px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text3)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif', transition: 'all 0.15s' },
  modeBtnActiveControl: { background: 'rgba(88,166,255,0.15)', color: 'var(--accent)' },
  modeBtnActiveDev:     { background: 'rgba(210,168,255,0.15)', color: '#D2A8FF' },
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

function roleLabelStyle(role: 'user' | 'assistant', mode: ChatMode): CSSProperties {
  const assistantColor = mode === 'dev' ? '#D2A8FF' : 'var(--accent2)';
  return {
    fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
    color: role === 'user' ? 'var(--accent)' : assistantColor,
    fontFamily: 'JetBrains Mono, monospace', marginBottom: 4,
  };
}

const INIT_MESSAGE: Message = {
  role: 'assistant',
  content: '안녕하세요. 프로젝트 상태나 다음 작업에 대해 물어보세요.\n맥락(dev_contexts)과 씨앗 상태(MindWorld)를 읽고 답합니다.\n상단에서 관제/개발 모드를 전환할 수 있습니다.',
};

const EMPTY_DRAFT: ContextDraft = { last_task: '', summary: '', next_action: '', current_problems: '' };

function loadMessages(): Message[] {
  if (typeof window === 'undefined') return [INIT_MESSAGE];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [INIT_MESSAGE];
    const parsed = JSON.parse(raw) as Message[];
    return parsed.length > 0 ? parsed : [INIT_MESSAGE];
  } catch { return [INIT_MESSAGE]; }
}

function saveMessages(msgs: Message[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(msgs)); } catch { /* 무시 */ }
}

export default function ChatPage() {
  const [messages, setMessages]   = useState<Message[]>([INIT_MESSAGE]);
  const [hydrated, setHydrated]   = useState(false);
  const [input, setInput]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [mode, setMode]           = useState<ChatMode>('control');
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [draft, setDraft]         = useState<ContextDraft>(EMPTY_DRAFT);
  const [hasDraft, setHasDraft]   = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [ownerKey, setOwnerKey]   = useState('');
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);   // 추가
  const bottomRef    = useRef<HTMLDivElement>(null);
  const textareaRef  = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setMessages(loadMessages());
    setHydrated(true);
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
      deviceId = 'device_' + crypto.randomUUID();
      localStorage.setItem('device_id', deviceId);
    }
    setOwnerKey(deviceId);
  }, []);
  useEffect(() => { if (hydrated) saveMessages(messages); }, [messages, hydrated]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
  };
const [expandedRaw, setExpandedRaw] = useState<Record<number, boolean>>({});
  const send = async () => {
    const msg = input.trim();
    if (!msg || loading) return;
    const userMsg: Message = { role: 'user', content: msg };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = '44px';
    setLoading(true);

    try {
      if (mode === 'control') {
        const history = nextMessages.slice(1).slice(-10).map((m) => ({ role: m.role, content: m.content }));
        const res  = await fetch('/api/hajun?action=chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg, history, owner_key: ownerKey }),
        });
        const json = await res.json();
        if (json._error) {
          setMessages(prev => [...prev, { role: 'assistant', content: `오류: ${json._error}` }]);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: json.reply || '(응답 없음)',
            observations: Array.isArray(json.observations) && json.observations.length > 0
              ? json.observations : undefined,
          }]);
        }
      } else {
        // 개발 모드 — 여러 AI 취합
        const res = await fetch('/api/hajun?action=dev_chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg }),
        });
        const json = await res.json();
        if (json._error) {
          setMessages(prev => [...prev, { role: 'assistant', content: `오류: ${json._error}` }]);
        } else {
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: json.reply || '(응답 없음)',
            devMeta: {
            bestSource: json.bestSource || '-',
            judgedBy: json.judgedBy || '-',
            participants: Array.isArray(json.participants) ? json.participants : [],
            failed: Array.isArray(json.failed) ? json.failed : [],
            rawResponses: Array.isArray(json.rawResponses) ? json.rawResponses : [],
          },
          }]);
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `네트워크 오류: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally { setLoading(false); }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearChat = () => { setMessages([INIT_MESSAGE]); localStorage.removeItem(STORAGE_KEY); };

  // 개별 답변 복사 함수 (추가)
  const copyAnswer = async (msg: Message, idx: number) => {
    try {
      await navigator.clipboard.writeText(msg.content);
      setCopiedIdx(idx);
      setTimeout(() => setCopiedIdx(null), 1500);
    } catch {
      // 클립보드 권한 실패 시 조용히 무시
    }
  };

  const analyzeContext = async () => {
    setAnalyzing(true); setStatusMsg('');
    try {
      const res  = await fetch('/api/hajun?action=summarize_context', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      const json = await res.json();
      if (json._error) { setStatusMsg(`❌ ${json._error}`); }
      else { setDraft(json.summary); setHasDraft(true); setStatusMsg('✅ 분석 완료 — 내용 확인 후 저장하세요'); }
    } catch (e) { setStatusMsg(`❌ ${e instanceof Error ? e.message : String(e)}`); }
    finally { setAnalyzing(false); }
  };

  const saveContext = async () => {
    setSaving(true); setStatusMsg('');
    try {
      const ctxRes  = await fetch('/api/hajun?action=dev_contexts');
      const ctxJson = await ctxRes.json();
      const id = ctxJson.payload?.id;
      if (!id) { setStatusMsg('❌ dev_contexts ID 없음'); setSaving(false); return; }
      const res  = await fetch('/api/hajun?action=update_dev_context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...draft }),
      });
      const json = await res.json();
      if (json._error) { setStatusMsg(`❌ ${json._error}`); }
      else { setStatusMsg('✅ dev_contexts 저장 완료'); setHasDraft(false); }
    } catch (e) { setStatusMsg(`❌ ${e instanceof Error ? e.message : String(e)}`); }
    finally { setSaving(false); }
  };

  // ── 맥락 갱신 패널 내용 (관제/개발 공통) ──────────
  const PanelContent = () => (
    <div style={S.panelBody}>
      <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
        전체 대화를 Gemini가 읽고 dev_contexts를 요약합니다.
      </div>
      <button style={{ ...S.analyzeBtn, ...(analyzing ? S.saveBtnOff : {}) }}
        onClick={analyzeContext} disabled={analyzing}>
        {analyzing ? '⏳ 분석 중...' : '🔍 맥락 요약 실행'}
      </button>
      {hasDraft && (
        <>
          <div>
            <div style={S.fieldLabel}>마지막 작업</div>
            <input style={S.fieldInput} value={draft.last_task}
              onChange={e => setDraft(d => ({ ...d, last_task: e.target.value }))} />
          </div>
          <div>
            <div style={S.fieldLabel}>요약</div>
            <textarea style={{ ...S.fieldTA, minHeight: 70 }} value={draft.summary}
              onChange={e => setDraft(d => ({ ...d, summary: e.target.value }))} />
          </div>
          <div>
            <div style={S.fieldLabel}>다음 액션</div>
            <input style={S.fieldInput} value={draft.next_action}
              onChange={e => setDraft(d => ({ ...d, next_action: e.target.value }))} />
          </div>
          <div>
            <div style={S.fieldLabel}>현재 문제</div>
            <input style={S.fieldInput} value={draft.current_problems}
              onChange={e => setDraft(d => ({ ...d, current_problems: e.target.value }))} />
          </div>
          <button style={{ ...S.saveBtn, ...(saving ? S.saveBtnOff : {}) }}
            onClick={saveContext} disabled={saving}>
            {saving ? '⏳ 저장 중...' : '💾 dev_contexts 저장'}
          </button>
        </>
      )}
      {statusMsg && (
        <div style={{ ...S.statusMsg, color: statusMsg.startsWith('✅') ? 'var(--accent2)' : 'var(--warn)' }}>
          {statusMsg}
        </div>
      )}
    </div>
  );

  const headerSub = mode === 'control'
    ? 'Groq(채팅) + Gemini(요약) · dev_contexts + MindWorld 기반'
    : 'Groq + Gemini + NVIDIA 병렬 취합 · 매 요청 랜덤 심사위원';

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        {/* 헤더 */}
        <div style={S.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={S.title}>{mode === 'control' ? '🧠 HajunAI' : '🛠 HajunAI 개발'}</div>
              <div style={S.sub}>{headerSub}</div>
            </div>

            {/* 관제 / 개발 토글 */}
            <div style={S.modeToggle}>
              <button
                style={{ ...S.modeBtn, ...(mode === 'control' ? S.modeBtnActiveControl : {}) }}
                onClick={() => setMode('control')}
              >
                🧠 관제
              </button>
              <button
                style={{ ...S.modeBtn, ...(mode === 'dev' ? S.modeBtnActiveDev : {}) }}
                onClick={() => setMode('dev')}
              >
                🛠 개발
              </button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...S.clearBtn, display: 'none' }}
                className="panel-toggle-btn"
                onClick={() => setPanelOpen(!panelOpen)}>
                {panelOpen ? '✕ 패널' : '⚙ 맥락'}
              </button>
              <button style={S.clearBtn} onClick={clearChat}>대화 초기화</button>
              {/* 기존 "📋 대화 복사" 버튼 제거 */}
            </div>
          </div>
        </div>

        <div style={S.body}>
          {/* 채팅 영역 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={S.messages}>
              {messages.map((m, i) => (
                <div key={i} style={bubbleStyle(m.role)}>
                  <div style={roleLabelStyle(m.role, mode)}>
                    {m.role === 'user' ? '나' : (mode === 'dev' && m.devMeta ? 'HajunAI 개발' : 'HajunAI')}
                  </div>
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

                  {m.devMeta && (
                    <div style={S.devMetaBox}>
                      <div style={S.devMetaLabel}>AI 취합 정보</div>
                      <div style={S.devMetaItem}>채택: {m.devMeta.bestSource}</div>
                      <div style={S.devMetaItem}>심사: {m.devMeta.judgedBy}</div>
                      <div style={S.devMetaItem}>참여: {m.devMeta.participants.join(', ') || '-'}</div>
                      {m.devMeta.failed.length > 0 && (
                        <div style={{ ...S.devMetaItem, color: 'var(--warn)' }}>
                          실패: {m.devMeta.failed.join(', ')}
                        </div>
                      )}
                      {m.devMeta.rawResponses && m.devMeta.rawResponses.length > 0 && (
                        <>
                          <button
                            onClick={() => setExpandedRaw(prev => ({ ...prev, [i]: !prev[i] }))}
                            style={{
                              marginTop: 8, background: 'none', border: '1px solid rgba(210,168,255,0.3)',
                              borderRadius: 6, color: '#D2A8FF', fontSize: 11, padding: '4px 10px',
                              cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace',
                            }}
                          >
                            {expandedRaw[i] ? '▲ 개별 답변 접기' : '▼ 개별 답변 전체 보기'}
                          </button>
                          {expandedRaw[i] && (
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {m.devMeta.rawResponses.map((r, j) => (
                                <div key={j} style={{
                                  padding: '8px 10px', background: 'var(--bg3)',
                                  border: '1px solid var(--border)', borderRadius: 6,
                                }}>
                                  <div style={{
                                    fontSize: 10, fontWeight: 700, color: r.error ? 'var(--warn)' : '#D2A8FF',
                                    fontFamily: 'JetBrains Mono, monospace', marginBottom: 4,
                                  }}>
                                    {r.name}{r.error ? ' (실패)' : ''}
                                  </div>
                                  <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                    {r.error || r.text}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* 개별 복사 버튼 (assistant만) */}
                  {m.role === 'assistant' && (
                    <button
                      onClick={() => copyAnswer(m, i)}
                      style={{
                        marginTop: 6, background: 'none', border: '1px solid var(--border)',
                        borderRadius: 6, color: copiedIdx === i ? 'var(--accent2)' : 'var(--text3)',
                        fontSize: 10, padding: '3px 8px', cursor: 'pointer',
                        fontFamily: 'JetBrains Mono, monospace',
                      }}
                    >
                      {copiedIdx === i ? '✅ 복사됨' : '📋 이 답변 복사'}
                    </button>
                  )}
                </div>
              ))}
              {loading && (
                <div style={S.thinking}>
                  {mode === 'control' ? 'HajunAI가 생각 중...' : 'Groq · Gemini · NVIDIA에 동시 질의 중...'}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div style={S.inputArea}>
              <div style={S.inputRow}>
                <textarea ref={textareaRef} style={S.textarea}
                  placeholder={mode === 'control'
                    ? '질문을 입력하세요... (Enter 전송, Shift+Enter 줄바꿈)'
                    : '개발 문제를 입력하세요... 여러 AI가 답하고 취합됩니다'}
                  value={input} onChange={handleInput} onKeyDown={onKeyDown}
                  rows={1} disabled={loading} />
                <button style={{ ...S.sendBtn, ...(loading || !input.trim() ? S.sendBtnOff : {}) }}
                  onClick={send} disabled={loading || !input.trim()}>
                  전송
                </button>
              </div>
              <div style={S.hint}>
                {mode === 'control'
                  ? '대화는 브라우저에 저장됩니다 · 저장: hajunai_conversations'
                  : '개발 모드는 대화 기록을 이어서 전달하지 않습니다 · 저장: hajunai_conversations (dev_chat)'}
              </div>
            </div>
          </div>

          {/* 데스크톱 패널 */}
          <div style={S.panel} className="desktop-panel">
            <div style={S.panelHeader}>
              <span style={S.panelTitle}>⚙ 맥락 갱신</span>
            </div>
            <PanelContent />
          </div>
        </div>

        {/* 모바일 패널 */}
        {panelOpen && (
          <div className="mobile-panel">
            <div style={{ ...S.panelHeader, borderBottom: '1px solid var(--border)' }}>
              <span style={S.panelTitle}>⚙ 맥락 갱신</span>
              <button style={S.clearBtn} onClick={() => setPanelOpen(false)}>✕</button>
            </div>
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <PanelContent />
            </div>
          </div>
        )}
      </main>

      <style>{`
        .desktop-panel { display: flex !important; }
        .mobile-panel  { display: none; }
        .panel-toggle-btn { display: none !important; }

        @media (max-width: 768px) {
          .desktop-panel { display: none !important; }
          .panel-toggle-btn { display: block !important; }
          .mobile-panel {
            display: flex;
            flex-direction: column;
            position: fixed;
            bottom: 0; left: 0; right: 0;
            max-height: 70vh;
            background: var(--bg2);
            border-top: 1px solid var(--border);
            border-radius: var(--radius) var(--radius) 0 0;
            z-index: 80;
            box-shadow: 0 -4px 24px rgba(0,0,0,0.4);
          }
        }
      `}</style>
    </div>
  );
}