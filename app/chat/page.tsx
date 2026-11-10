'use client';
import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Sidebar from '@/components/Sidebar';

type HermesInfo = {
  hasActionUnit: boolean;
  candidates: string[];
  primary?: string;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
  observations?: string[];
  /** Phase 1: 제안만. 실행은 사람 승인 후 기존 경로. */
  hermes?: HermesInfo;
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
  header:      { padding: '18px 28px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  title:       { fontSize: 24, fontWeight: 700, marginBottom: 3 },
  sub:         { fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 },
  body:        { flex: 1, display: 'flex', overflow: 'hidden' },
  messages:    { flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 18 },
  text:        { fontSize: 16, color: 'var(--text)', lineHeight: 1.75, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  obsBox:      { marginTop: 12, padding: '10px 12px', background: 'rgba(63,185,80,0.07)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 6 },
  obsLabel:    { fontSize: 13, fontWeight: 700, letterSpacing: 0.3, color: 'var(--accent2)', marginBottom: 7 },
  obsItem:     { fontSize: 14, color: 'var(--text2)', lineHeight: 1.7, paddingLeft: 2 },
  hermesBox:   { marginTop: 12, padding: '12px 14px', background: 'rgba(88,166,255,0.07)', border: '1px solid rgba(88,166,255,0.25)', borderRadius: 6 },
  hermesLabel: { fontSize: 13, fontWeight: 700, letterSpacing: 0.3, color: 'var(--accent)', marginBottom: 7 },
  hermesMeta:  { fontSize: 14, color: 'var(--text2)', lineHeight: 1.65, marginBottom: 10 },
  hermesHint:  { fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 10 },
  hermesRow:   { display: 'flex', flexWrap: 'wrap', gap: 8 },
  hermesBtn:   { fontSize: 14, minHeight: 40, padding: '8px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  inputArea:   { padding: '14px 24px 18px', borderTop: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  inputRow:    { display: 'flex', gap: 10, alignItems: 'flex-end' },
  textarea:    { flex: 1, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '12px 14px', fontSize: 16, outline: 'none', resize: 'none', fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1.6, minHeight: 52, maxHeight: 160 },
  sendBtn:     { padding: '12px 20px', background: 'var(--accent)', color: '#0D1117', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif', flexShrink: 0, minHeight: 52 },
  sendBtnOff:  { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  hint:        { fontSize: 13, color: 'var(--text2)', marginTop: 8 },
  panel:       { width: 340, borderLeft: '1px solid var(--border)', background: 'var(--bg2)', display: 'flex', flexDirection: 'column', flexShrink: 0, overflowY: 'auto' },
  panelHeader: { padding: '16px 20px 12px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle:  { fontSize: 15, fontWeight: 700, color: 'var(--text)', fontFamily: 'Noto Sans KR, sans-serif' },
  panelBody:   { padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 },
  fieldLabel:  { fontSize: 14, fontWeight: 700, letterSpacing: 0.1, color: 'var(--text2)', marginBottom: 5 },
  fieldInput:  { width: '100%', minHeight: 44, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '9px 12px', fontSize: 15, outline: 'none', fontFamily: 'Noto Sans KR, sans-serif', boxSizing: 'border-box' },
  fieldTA:     { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '10px 12px', fontSize: 15, outline: 'none', resize: 'vertical', fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1.65, boxSizing: 'border-box' },
  analyzeBtn:  { width: '100%', minHeight: 44, padding: '10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 7, color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  saveBtn:     { width: '100%', minHeight: 48, padding: '11px', background: 'var(--accent2)', border: 'none', borderRadius: 7, color: '#0D1117', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  saveBtnOff:  { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  statusMsg:   { fontSize: 14, lineHeight: 1.55, textAlign: 'center', padding: '6px 0', fontFamily: 'Noto Sans KR, sans-serif' },
  clearBtn:    { background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 6, padding: '8px 12px', fontSize: 14, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  section:     { borderTop: '1px solid var(--border)', paddingTop: 14, marginTop: 4 },
  smallBtn:    { fontSize: 14, minHeight: 40, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  thinking:    { alignSelf: 'flex-start', fontSize: 15, color: 'var(--text2)', fontStyle: 'italic', padding: '6px 0' },
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
    fontSize: 13, fontWeight: 700, letterSpacing: 0.2, textTransform: 'uppercase',
    color: role === 'user' ? 'var(--accent)' : 'var(--accent2)',
    fontFamily: 'Noto Sans KR, sans-serif', marginBottom: 6,
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

  // Phase 1: 이해갱신 승인 (Option A)
  const [showUnderstandingConfirm, setShowUnderstandingConfirm] = useState(false);
  const [currentUnderstanding, setCurrentUnderstanding] = useState<string | null>(null);
  const [understandingLoading, setUnderstandingLoading] = useState(false);
  const [resynthLoading, setResynthLoading] = useState(false);

  // Phase 1: connect proposal (hint only, no write)
  const [showConnectHint, setShowConnectHint] = useState(false);
  const [connectUnderstanding, setConnectUnderstanding] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);

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
        const hermesRaw = json.hermes;
        const hermes: HermesInfo | undefined =
          hermesRaw && typeof hermesRaw === 'object'
            ? {
                hasActionUnit: !!hermesRaw.hasActionUnit,
                candidates: Array.isArray(hermesRaw.candidates)
                  ? hermesRaw.candidates.map(String)
                  : [],
                primary: hermesRaw.primary ? String(hermesRaw.primary) : undefined,
              }
            : undefined;
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: json.reply || '(응답 없음)',
          observations: Array.isArray(json.observations) && json.observations.length > 0
            ? json.observations : undefined,
          hermes,
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

  /** Phase 1: 남김 제안 승인 → 기존 마당 패널만 채움. Hermes는 write 하지 않음. */
  const acceptLeave = (m: Message) => {
    const lastUser = [...messages].reverse().find((x) => x.role === 'user');
    const seed = (lastUser?.content || m.content || '').trim();
    if (seed) setYardContent(seed);
    setMsgType('understanding');
    setPanelOpen(true);
    setYardStatus('Hermes 제안: 남김 — 내용 확인 후 「마당에 남기기」로 승인');
  };

  /** Phase 1: 확인질문 제안 → 입력창 초안만. 전송은 사람. */
  const acceptConfirmQuestion = () => {
    const draftQ = '이 부분에서 확인하고 싶은 점이 있어요. 어떤 의미로 말씀하신 건가요?';
    setInput(draftQ);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 140) + 'px';
      textareaRef.current.focus();
    }
  };

  /** Phase 1: 연결 제안 - 현재 이해만 보여줌. 자동 링크/write 없음. */
  const acceptConnect = async () => {
    setConnectLoading(true);
    setConnectUnderstanding(null);
    setConnectError(null);
    setShowConnectHint(true);
    try {
      const res = await fetch('/api/hajun?action=contexts');
      const json = await res.json();
      if (!res.ok || json?._error) {
        throw new Error(json?._error || `HTTP ${res.status}`);
      }
      const text = String(json?.payload?.understanding || '').trim();
      setConnectUnderstanding(text || null);
    } catch (e) {
      setConnectError(`이해를 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setConnectLoading(false);
    }
  };

  /** Phase 1: 이해갱신 1차 — 현재 이해만 보여줌. synthesize 호출 없음. */
  const acceptUnderstandingUpdate = async () => {
    setUnderstandingLoading(true);
    setCurrentUnderstanding(null);
    setShowUnderstandingConfirm(true);
    try {
      const res = await fetch('/api/hajun?action=contexts');
      const json = await res.json();
      const text =
        (json?.payload?.understanding && String(json.payload.understanding).trim()) ||
        '(아직 저장된 이해가 없습니다)';
      setCurrentUnderstanding(text);
    } catch (e) {
      setCurrentUnderstanding(
        `이해를 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`
      );
    } finally {
      setUnderstandingLoading(false);
    }
  };

  /** Phase 1: 이해갱신 2차 — 사람 확인 후에만 기존 synthesize_context 호출. */
  const confirmResynthesize = async () => {
    if (resynthLoading) return;
    setResynthLoading(true);
    try {
      const res = await fetch('/api/hajun?action=synthesize_context', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const json = await res.json();
      if (json._error) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: `이해 갱신 실패: ${json._error}` },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '이해를 다시 만들었습니다.' },
        ]);
      }
      setShowUnderstandingConfirm(false);
      setCurrentUnderstanding(null);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `이해 갱신 네트워크 오류: ${e instanceof Error ? e.message : String(e)}`,
        },
      ]);
    } finally {
      setResynthLoading(false);
    }
  };

  const PanelContent = () => (
    <div style={S.panelBody}>
      <div>
        <div style={{ ...S.fieldLabel, color: 'var(--accent2)' }}>마당에 남기기</div>
        <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.65, marginBottom: 10 }}>
          결정·이슈·문서 등 남길 내용만 적으세요. 초안은 직접 확인한 뒤 저장해야 마당 원본이 됩니다.
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
          placeholder="초안을 편집하세요. 아직 마당에 저장되지 않았습니다."
          value={yardContent}
          onChange={(e) => setYardContent(e.target.value)}
        />
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: 'var(--text2)', lineHeight: 1.6, marginTop: 10 }}>
          <input type="checkbox" checked={synthAfter} onChange={(e) => setSynthAfter(e.target.checked)} />
          원본 저장 뒤 HajunAI의 현재 이해도 다시 종합
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
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.65, marginBottom: 10 }}>
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
                onChange={(e) => setDraft(d => ({ ...d, last_task: e.target.value }))} />
            </div>
            <div>
              <div style={S.fieldLabel}>요약</div>
              <textarea style={{ ...S.fieldTA, minHeight: 72 }} value={draft.summary}
                onChange={(e) => setDraft(d => ({ ...d, summary: e.target.value }))} />
            </div>
            <div>
              <div style={S.fieldLabel}>다음 액션</div>
              <textarea style={{ ...S.fieldTA, minHeight: 56 }} value={draft.next_action}
                onChange={(e) => setDraft(d => ({ ...d, next_action: e.target.value }))} />
            </div>
            <div>
              <div style={S.fieldLabel}>현재 문제</div>
              <textarea style={{ ...S.fieldTA, minHeight: 56 }} value={draft.current_problems}
                onChange={(e) => setDraft(d => ({ ...d, current_problems: e.target.value }))} />
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={S.title}>HajunAI</div>
              <div style={S.sub}>대화 · 마당 원본과 분리 · Hermes 제안만</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={S.clearBtn} onClick={clearChat}>대화 비우기</button>
              <button style={{ ...S.clearBtn }} className="panel-toggle-btn" onClick={() => setPanelOpen(true)}>원본·맥락</button>
            </div>
          </div>
        </div>

        <div style={S.body}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
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
                  {m.role === 'assistant' && m.hermes?.hasActionUnit && (
                    <div style={S.hermesBox}>
                      <div style={S.hermesLabel}>Hermes 제안 · 실행 아님</div>
                      <div style={S.hermesMeta}>
                        후보: {(m.hermes.candidates || []).join(', ') || '—'}
                        {m.hermes.primary ? ` · 우선: ${m.hermes.primary}` : ''}
                      </div>
                      <div style={S.hermesHint}>
                        승인 후에만 반영됩니다. Hermes가 자동으로 남기거나 이해를 바꾸지 않습니다.
                      </div>
                      <div style={S.hermesRow}>
                        {(m.hermes.candidates || []).includes('남김') && (
                          <button type="button" style={S.hermesBtn} onClick={() => acceptLeave(m)}>
                            남김 제안 받기
                          </button>
                        )}
                        {(m.hermes.candidates || []).includes('확인질문') && (
                          <button type="button" style={S.hermesBtn} onClick={acceptConfirmQuestion}>
                            확인 질문 초안
                          </button>
                        )}
                        {(m.hermes.candidates || []).includes('이해갱신') && (
                          <button type="button" style={S.hermesBtn} onClick={acceptUnderstandingUpdate}>
                            이해갱신 제안 받기
                          </button>
                        )}
                        {(m.hermes.candidates || []).includes('연결') && (
                          <button type="button" style={S.hermesBtn} onClick={acceptConnect}>
                            연결 제안 보기
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {loading && <div style={S.thinking}>HajunAI가 생각 중...</div>}
              <div ref={bottomRef} />
            </div>

      {/* Phase 1: 이해갱신 2차 확인 패널 */}
      {showUnderstandingConfirm && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: 'min(480px, 92vw)',
              maxHeight: '80vh',
              overflowY: 'auto',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ ...S.hermesLabel, marginBottom: 0 }}>현재 이해</div>
            <div
              style={{
                fontSize: 15,
                color: 'var(--text)',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 12px',
                minHeight: 80,
              }}
            >
              {understandingLoading
                ? '불러오는 중…'
                : currentUnderstanding || '(없음)'}
            </div>
            <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.6 }}>
              이 이해를 다시 만들까요? Hermes가 자동으로 실행하지 않습니다.
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={S.hermesBtn}
                onClick={() => {
                  setShowUnderstandingConfirm(false);
                  setCurrentUnderstanding(null);
                }}
                disabled={resynthLoading}
              >
                취소
              </button>
              <button
                type="button"
                style={{
                  ...S.hermesBtn,
                  background: 'var(--accent)',
                  color: '#0D1117',
                  border: 'none',
                  fontWeight: 700,
                }}
                onClick={confirmResynthesize}
                disabled={resynthLoading || understandingLoading}
              >
                {resynthLoading ? '실행 중…' : '이 이해를 다시 만들기'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 1: 연결 제안 - 현재 이해 표시만. write/링크 없음 */}
      {showConnectHint && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 50,
          }}
        >
          <div
            style={{
              width: 'min(480px, 92vw)',
              maxHeight: '80vh',
              overflowY: 'auto',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              padding: '16px 18px',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ ...S.hermesLabel, marginBottom: 0 }}>연결 제안 · 참고 확인</div>
            <div style={{ fontSize: 14, color: 'var(--text2)', lineHeight: 1.65 }}>
              현재 이해 최대 800자를 마당 패널 초안에 덧붙입니다. 아직 저장되거나 메시지끼리 연결되지는 않습니다.
            </div>
            <div
              style={{
                fontSize: 15,
                color: 'var(--text)',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                padding: '10px 12px',
                minHeight: 80,
              }}
            >
              {connectLoading
                ? '현재 이해를 불러오는 중…'
                : connectError || connectUnderstanding || '아직 저장된 이해가 없습니다.'}
            </div>
            {yardContent.trim() && !connectLoading && !connectError && connectUnderstanding && (
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>
                기존 초안은 유지하고, 참고 내용을 아래에 덧붙입니다.
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                style={S.hermesBtn}
                onClick={() => {
                  setShowConnectHint(false);
                  setConnectUnderstanding(null);
                  setConnectError(null);
                }}
              >
                닫기
              </button>
              <button
                type="button"
                style={{ ...S.hermesBtn, ...(connectLoading || !!connectError || !connectUnderstanding ? S.saveBtnOff : {}) }}
                disabled={connectLoading || !!connectError || !connectUnderstanding}
                onClick={() => {
                  const seed = (connectUnderstanding || '').trim();
                  if (seed) {
                    const reference = `[연결 참고]\n${seed.slice(0, 800)}`;
                    if (yardContent.includes(reference)) {
                      setYardStatus('✅ 이 참고 내용은 이미 초안에 있습니다. 아직 마당 원본으로 저장되지는 않았습니다.');
                    } else {
                      setYardContent((prev) =>
                        prev.trim() ? `${prev.trim()}\n\n${reference}` : reference
                      );
                      setYardStatus('✅ 참고 내용을 초안에 덧붙였습니다. 아직 마당 원본으로 저장되지는 않았습니다.');
                    }
                    setPanelOpen(true);
                  }
                  setShowConnectHint(false);
                  setConnectUnderstanding(null);
                  setConnectError(null);
                }}
              >
                참고 내용을 초안으로 가져오기
              </button>
            </div>
          </div>
        </div>
      )}

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
          .panel-toggle-btn { display: inline-block !important; }
          .mobile-panel {
            display: flex !important;
            flex-direction: column;
            position: fixed;
            inset: 0;
            z-index: 40;
            background: var(--bg2);
          }
        }
      `}</style>
    </div>
  );
}
