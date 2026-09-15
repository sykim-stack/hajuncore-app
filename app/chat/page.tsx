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

type YardOpt = { key: string; name?: string };
type RoomOpt = { key: string; name?: string; id?: string };

const STORAGE_KEY = 'hajunai_chat_messages';
const YARD_ALLOW = new Set(['gwanje', 'gaebal', 'brainpool']);

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
  inputArea:   { padding: '12px 24px 16px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  inputRow:    { display: 'flex', gap: 10, alignItems: 'flex-end' },
  textarea:    { flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 14px', fontSize: 13, outline: 'none', resize: 'none', fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1.5, minHeight: 44, maxHeight: 140 },
  sendBtn:     { padding: '10px 18px', background: 'var(--accent)', color: '#0D1117', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif', flexShrink: 0, height: 44 },
  sendBtnOff:  { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  hint:        { fontSize: 10, color: 'var(--text3)', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' },
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
  section:     { borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 },
  smallBtn:    { fontSize: 10, padding: '4px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace' },
  thinking:    { alignSelf: 'flex-start', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', padding: '4px 0' },
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
  content:
    '안녕하세요. 마당 원본을 이해하고 대화하는 HajunAI입니다.\n' +
    '창에만 적은 말은 세션 한도이고, 남길 내용은 오른쪽 「마당에 남기기」로 원본이 됩니다.',
};

const EMPTY_DRAFT: ContextDraft = { last_task: '', summary: '', next_action: '', current_problems: '' };

const MSG_TYPES = [
  { value: 'understanding', label: '이해/정리' },
  { value: 'decision', label: '결정·방향' },
  { value: 'issue', label: '문제·이슈' },
  { value: 'doc_injection', label: '문서·자료' },
  { value: 'work_result', label: '작업 결과' },
];

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
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving]       = useState(false);
  const [draft, setDraft]         = useState<ContextDraft>(EMPTY_DRAFT);
  const [hasDraft, setHasDraft]   = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [panelOpen, setPanelOpen] = useState(false);
  const [ownerKey, setOwnerKey]   = useState('');

  const [yards, setYards]           = useState<YardOpt[]>([]);
  const [rooms, setRooms]           = useState<RoomOpt[]>([]);
  const [yardKey, setYardKey]       = useState('gaebal');
  const [roomKey, setRoomKey]       = useState('');
  const [msgType, setMsgType]       = useState('understanding');
  const [yardContent, setYardContent] = useState('');
  const [yardSaving, setYardSaving] = useState(false);
  const [yardStatus, setYardStatus] = useState('');
  const [synthAfter, setSynthAfter] = useState(true);

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

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/hajun?action=yard_list');
        const json = await res.json();
        const list = (json.payload || []) as Array<{ key?: string; name?: string }>;
        const filtered = list
          .filter((y) => y.key && YARD_ALLOW.has(y.key))
          .map((y) => ({ key: y.key as string, name: y.name }));
        setYards(filtered.length ? filtered : [
          { key: 'gwanje', name: '관제' },
          { key: 'gaebal', name: '개발' },
          { key: 'brainpool', name: '브라이언풀' },
        ]);
      } catch {
        setYards([
          { key: 'gwanje', name: '관제' },
          { key: 'gaebal', name: '개발' },
          { key: 'brainpool', name: '브라이언풀' },
        ]);
      }
    })();
  }, []);

  useEffect(() => {
    if (!yardKey) return;
    (async () => {
      setRooms([]);
      setRoomKey('');
      try {
        const res = await fetch(`/api/hajun?action=room_list&yard=${encodeURIComponent(yardKey)}`);
        const json = await res.json();
        const list = (json.payload?.rooms || []) as Array<{ key?: string; name?: string; id?: string }>;
        const opts = list.filter((r) => r.key).map((r) => ({ key: r.key as string, name: r.name, id: r.id }));
        setRooms(opts);
        if (opts[0]) setRoomKey(opts[0].key);
      } catch { /* ignore */ }
    })();
  }, [yardKey]);

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
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `네트워크 오류: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally { setLoading(false); }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const clearChat = () => { setMessages([INIT_MESSAGE]); localStorage.removeItem(STORAGE_KEY); };

  const fillFromLastUser = () => {
    const last = [...messages].reverse().find((m) => m.role === 'user');
    if (last) setYardContent(last.content);
    else setYardStatus('최근 내 말이 없습니다');
  };

  const fillFromLastAssistant = () => {
    const last = [...messages].reverse().find((m) => m.role === 'assistant' && m !== messages[0]);
    if (last) setYardContent(last.content);
    else setYardStatus('최근 HajunAI 답이 없습니다');
  };

  const saveToYard = async () => {
    const content = yardContent.trim();
    if (!content || !yardKey || !roomKey || yardSaving) return;
    setYardSaving(true);
    setYardStatus('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yard_key: yardKey,
          room_key: roomKey,
          author_type: 'human',
          author_name: 'user',
          msg_type: msgType,
          content,
          ref_ids: [],
        }),
      });
      const json = await res.json();
      if (json._error) {
        setYardStatus(`❌ ${json._error}`);
      } else {
        setYardStatus(`✅ ${yardKey}/${roomKey}에 원본 저장`);
        if (synthAfter) {
          try {
            await fetch('/api/hajun?action=synthesize_context', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: '{}',
            });
            setYardStatus(`✅ ${yardKey}/${roomKey} 저장 · 이해 종합 실행`);
          } catch {
            setYardStatus(`✅ 저장됨 (종합 호출 실패 — 나중에 synthesize 가능)`);
          }
        }
      }
    } catch (e) {
      setYardStatus(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setYardSaving(false);
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

  const PanelContent = () => (
    <div style={S.panelBody}>
      <div>
        <div style={{ ...S.fieldLabel, color: 'var(--accent2)' }}>마당에 남기기</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5, marginBottom: 8 }}>
          결정·이슈·문서 등 원본으로 남길 때만. 잡담은 남기지 않습니다.
        </div>
        <div style={S.fieldLabel}>마당</div>
        <select style={S.fieldInput} value={yardKey} onChange={(e) => setYardKey(e.target.value)}>
          {(yards.length ? yards : [
            { key: 'gwanje', name: '관제' },
            { key: 'gaebal', name: '개발' },
            { key: 'brainpool', name: '브라이언풀' },
          ]).map((y) => (
            <option key={y.key} value={y.key}>{y.name || y.key} ({y.key})</option>
          ))}
        </select>
        <div style={{ ...S.fieldLabel, marginTop: 8 }}>방</div>
        <select style={S.fieldInput} value={roomKey} onChange={(e) => setRoomKey(e.target.value)} disabled={!rooms.length}>
          {!rooms.length && <option value="">방 목록 없음</option>}
          {rooms.map((r) => (
            <option key={r.key} value={r.key}>{r.name || r.key}</option>
          ))}
        </select>
        <div style={{ ...S.fieldLabel, marginTop: 8 }}>종류</div>
        <select style={S.fieldInput} value={msgType} onChange={(e) => setMsgType(e.target.value)}>
          {MSG_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 6 }}>
          <button type="button" style={S.smallBtn} onClick={fillFromLastUser}>최근 내 말</button>
          <button type="button" style={S.smallBtn} onClick={fillFromLastAssistant}>최근 답</button>
        </div>
        <textarea
          style={{ ...S.fieldTA, minHeight: 88 }}
          placeholder="마당에 남길 원문..."
          value={yardContent}
          onChange={(e) => setYardContent(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
          <input type="checkbox" checked={synthAfter} onChange={(e) => setSynthAfter(e.target.checked)} />
          저장 후 이해 종합(synthesize)
        </label>
        <button
          style={{ ...S.saveBtn, marginTop: 8, ...(yardSaving || !yardContent.trim() || !roomKey ? S.saveBtnOff : {}) }}
          onClick={saveToYard}
          disabled={yardSaving || !yardContent.trim() || !roomKey}
        >
          {yardSaving ? '⏳ 저장 중...' : '📌 마당에 남기기'}
        </button>
        {yardStatus && (
          <div style={{ ...S.statusMsg, color: yardStatus.startsWith('✅') ? 'var(--accent2)' : 'var(--warn)' }}>
            {yardStatus}
          </div>
        )}
      </div>

      <div style={S.section}>
        <div style={S.fieldLabel}>dev_contexts (개발 핸드오프)</div>
        <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.6, marginBottom: 8 }}>
          요약 API는 축소됨. synthesize_context 권장.
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
    </div>
  );

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div style={S.header}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div style={S.title}>HajunAI</div>
              <div style={S.sub}>현관(chat) · 원본은 마당 · 이해는 contexts</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={{ ...S.clearBtn, display: 'none' }}
                className="panel-toggle-btn"
                onClick={() => setPanelOpen(!panelOpen)}>
                {panelOpen ? '✕ 패널' : '⚙ 패널'}
              </button>
              <button style={S.clearBtn} onClick={clearChat}>대화 초기화</button>
            </div>
          </div>
        </div>

        <div style={S.body}>
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
                <textarea ref={textareaRef} style={S.textarea}
                  placeholder="질문… (Enter 전송 · 원본 남기기는 오른쪽 패널)"
                  value={input} onChange={handleInput} onKeyDown={onKeyDown}
                  rows={1} disabled={loading} />
                <button style={{ ...S.sendBtn, ...(loading || !input.trim() ? S.sendBtnOff : {}) }}
                  onClick={send} disabled={loading || !input.trim()}>
                  전송
                </button>
              </div>
              <div style={S.hint}>브라우저 대화 보관 · 영구 원본은 「마당에 남기기」</div>
            </div>
          </div>

          <div style={S.panel} className="desktop-panel">
            <div style={S.panelHeader}>
              <span style={S.panelTitle}>원본 · 맥락</span>
            </div>
            <PanelContent />
          </div>
        </div>

        {panelOpen && (
          <div className="mobile-panel">
            <div style={{ ...S.panelHeader, borderBottom: '1px solid var(--border)' }}>
              <span style={S.panelTitle}>원본 · 맥락</span>
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
            z-index: 40;
          }
        }
      `}</style>
    </div>
  );
}
