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
  header:      { padding: '16px 28px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  title:       { fontSize: 20, fontWeight: 700, marginBottom: 2 },
  sub:         { fontSize: 11, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' },
  body:        { flex: 1, display: 'flex', overflow: 'hidden' },
  messages:    { flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 },
  text:        { fontSize: 13, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  obsBox:      { marginTop: 10, padding: '8px 10px', background: 'rgba(63,185,80,0.07)', border: '1px solid rgba(63,185,80,0.2)', borderRadius: 6 },
  obsLabel:    { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent2)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  obsItem:     { fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, paddingLeft: 2 },
  hermesBox:   { marginTop: 10, padding: '8px 10px', background: 'rgba(88,166,255,0.07)', border: '1px solid rgba(88,166,255,0.25)', borderRadius: 6 },
  hermesLabel: { fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  hermesMeta:  { fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 8 },
  hermesHint:  { fontSize: 10, color: 'var(--text3)', lineHeight: 1.45, marginBottom: 8 },
  hermesRow:   { display: 'flex', flexWrap: 'wrap', gap: 6 },
  hermesBtn:   { fontSize: 11, padding: '5px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
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

  // Phase 1: 이해갱신 승인 (Option A)
  const [showUnderstandingConfirm, setShowUnderstandingConfirm] = useState(false);
  const [currentUnderstanding, setCurrentUnderstanding] = useState<string | null>(null);
  const [understandingLoading, setUnderstandingLoading] = useState(false);
  const [resynthLoading, setResynthLoading] = useState(false);

  // Phase 1: 연결 제안 (ref/칩 제안만 · write 없음)
  const [showConnectHint, setShowConnectHint] = useState(false);
  const [connectUnderstanding, setConnectUnderstanding] = useState<string | null>(null);
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

  /** Phase 1: 연결 제안 — 현재 이해만 보여줌. 자동 링크/write 없음. */
  const acceptConnect = async () => {
    setConnectLoading(true);
    setConnectUnderstanding(null);
    setShowConnectHint(true);
    try {
      const res = await fetch('/api/hajun?action=contexts');
      const json = await res.json();
      const t =
        (json?.payload?.understanding && String(json.payload.understanding).trim()) ||
        '(아직 저장된 이해가 없습니다)';
      setConnectUnderstanding(t);
    } catch (e) {
      setConnectUnderstanding(
        `이해를 불러오지 못했습니다: ${e instanceof Error ? e.message : String(e)}`
      );
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

  // NOTE: remainder of component (PanelContent, JSX return) follows in recovery if truncated
  return null;
}
