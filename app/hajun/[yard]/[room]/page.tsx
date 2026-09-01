'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  HajunYard, HajunRoom, HajunMessage,
  MSG_TYPE_LABEL, MSG_TYPE_COLOR, MSG_TYPE_ORDER, MsgType, YARD_LABEL,
} from '@/types/hajun';

const S: Record<string, React.CSSProperties> = {
  page:  { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main:  { flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden', minWidth: 0 },
  header:{ padding: '16px 28px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  crumb: { fontSize: 12, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: 700 },

  body:      { flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: 760 },
  msgCard:   { marginBottom: 16, padding: 14, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', transition: 'background 0.6s ease' },
  msgCardAi: { borderLeft: '3px solid #39C5CF' },
  msgTop:    { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  chip:      { fontSize: 10, padding: '2px 8px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 },
  author:    { fontSize: 12, fontWeight: 600, color: 'var(--text)' },
  authorTag: { fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' },
  time:      { fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginLeft: 'auto' },
  content:   { fontSize: 13, color: 'var(--text)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const },
  refRow:    { marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  refLabel:  { fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' },
  refChip:   { fontSize: 11, padding: '3px 8px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', cursor: 'pointer', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty:     { fontSize: 13, color: 'var(--text3)', padding: '40px 0', textAlign: 'center' },

  compose:   { borderTop: '1px solid var(--border)', background: 'var(--bg2)', padding: '14px 24px 18px', flexShrink: 0 },
  row:       { display: 'flex', gap: 10, marginBottom: 8, flexWrap: 'wrap' as const },
  input:     { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'Noto Sans KR, sans-serif' },
  select:    { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12, outline: 'none', fontFamily: 'Noto Sans KR, sans-serif' },
  textarea:  { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 14px', fontSize: 13, outline: 'none', resize: 'vertical' as const, fontFamily: 'Noto Sans KR, sans-serif', lineHeight: 1.5, minHeight: 70, marginBottom: 8 },
  refPicker: { display: 'flex', gap: 6, flexWrap: 'wrap' as const, marginBottom: 10, maxHeight: 70, overflowY: 'auto' as const },
  refHint:   { fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  refToggle: { fontSize: 11, padding: '4px 9px', borderRadius: 6, cursor: 'pointer', border: '1px solid var(--border)', fontFamily: 'JetBrains Mono, monospace' },
  btnRow:    { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  submitBtn: { padding: '9px 20px', background: 'var(--accent)', color: '#0D1117', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  aiBtn:     { padding: '9px 20px', background: '#39C5CF', color: '#0D1117', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  submitOff: { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  errMsg:    { fontSize: 12, color: 'var(--warn)', marginTop: 8 },
};

function chip(type: MsgType) {
  const color = MSG_TYPE_COLOR[type];
  return <span style={{ ...S.chip, background: `${color}22`, color }}>{MSG_TYPE_LABEL[type]}</span>;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function RoomPage() {
  const params = useParams();
  const yardKey = params.yard as string;
  const roomKey = params.room as string;

  const [room, setRoom]         = useState<HajunRoom | null>(null);
  const [messages, setMessages] = useState<HajunMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [posting, setPosting]   = useState(false);
  const [aiResponding, setAiResponding] = useState(false);
  const [errMsg, setErrMsg]     = useState('');

  const [content, setContent]   = useState('');
  const [msgType, setMsgType]   = useState<MsgType>('question');
  const [authorName, setAuthorName] = useState('여리');
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());

  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    // room_id는 URL에 없으므로 room_list로 먼저 확정 (검증된 기존 action은 건드리지 않음)
    const listRes = await fetch(`/api/hajun?action=room_list&yard=${yardKey}`);
    const listJson = await listRes.json();
    const found: HajunRoom | undefined = listJson.payload?.rooms?.find(
      (r: HajunRoom) => r.key === roomKey
    );
    if (!found) { setLoading(false); return; }
    setRoom(found);

    const viewRes = await fetch(`/api/hajun?action=view_room&room_id=${found.id}`);
    const viewJson = await viewRes.json();
    setMessages(viewJson.payload?.messages || []);
    setLoading(false);
  }, [yardKey, roomKey]);

  useEffect(() => { load(); }, [load]);

  const toggleRef = (id: string) => {
    setSelectedRefs((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const scrollToMsg = (id: string) => {
    const el = document.getElementById(`msg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prevBg = el.style.background;
    el.style.background = 'rgba(88,166,255,0.12)';
    setTimeout(() => { el.style.background = prevBg; }, 900);
  };

  const submit = async () => {
    if (!room || !content.trim() || posting) return;
    setPosting(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: room.id,
          author_type: 'human',
          author_name: authorName || '익명',
          msg_type: msgType,
          content: content.trim(),
          ref_ids: Array.from(selectedRefs),
        }),
      });
      const json = await res.json();
      if (json._error) {
        setErrMsg(json._error);
      } else {
        setContent('');
        setSelectedRefs(new Set());
        await load();
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } finally {
      setPosting(false);
    }
  };

  // 두뇌 AI에게 이 방을 읽고 답해달라고 요청.
  // selectedRefs가 있으면 "이 메시지들 보고 답해줘"로 넘기고,
  // 없으면 서버가 알아서 방의 가장 최근 메시지를 대상으로 삼는다.
  const requestAi = async () => {
    if (!room || aiResponding) return;
    setAiResponding(true);
    setErrMsg('');
    try {
      const res = await fetch('/api/hajun?action=ai_respond', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: room.id,
          ref_ids: Array.from(selectedRefs),
        }),
      });
      const json = await res.json();
      if (json._error) {
        setErrMsg(json._error);
      } else {
        setSelectedRefs(new Set());
        await load();
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } finally {
      setAiResponding(false);
    }
  };

  const findMsg = (id: string) => messages.find((m) => m.id === id);

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div style={S.header}>
          <div className="mobile-header-space" />
          <div style={S.crumb}>
            <Link href="/hajun" style={{ color: 'var(--text3)' }}>하준아이</Link>
            {' > '}
            <Link href={`/hajun/${yardKey}`} style={{ color: 'var(--text3)' }}>{YARD_LABEL[yardKey] || yardKey}</Link>
            {' > 방'}
          </div>
          <div style={S.title}>{room?.name || '방'}</div>
        </div>

        <div style={S.body}>
          {loading && <div style={{ color: 'var(--text2)', fontSize: 13 }}>⏳ 로딩 중...</div>}
          {!loading && messages.length === 0 && (
            <div style={S.empty}>아직 이 방에 메시지가 없습니다. 아래에서 첫 메시지를 남겨보세요.</div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              id={`msg-${m.id}`}
              style={{ ...S.msgCard, ...(m.author_type === 'ai' ? S.msgCardAi : {}) }}
            >
              <div style={S.msgTop}>
                {chip(m.msg_type)}
                <span style={S.author}>{m.author_name}</span>
                <span style={S.authorTag}>{m.author_type === 'human' ? '사람' : 'AI 참여자'}</span>
                <span style={S.time}>{fmtTime(m.created_at)}</span>
              </div>
              <div style={S.content}>{m.content}</div>
              {m.ref_ids.length > 0 && (
                <div style={S.refRow}>
                  <span style={S.refLabel}>↳ 딛고 있음:</span>
                  {m.ref_ids.map((refId) => {
                    const ref = findMsg(refId);
                    return (
                      <span
                        key={refId}
                        style={S.refChip}
                        onClick={() => scrollToMsg(refId)}
                        title={ref ? ref.content : '다른 방의 메시지'}
                      >
                        {ref ? `${ref.author_name}: ${ref.content}` : `#${refId.slice(0, 8)}`}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <div style={S.compose}>
          <div style={S.row}>
            <select style={S.select} value={msgType} onChange={(e) => setMsgType(e.target.value as MsgType)}>
              {MSG_TYPE_ORDER.map((t) => (
                <option key={t} value={t}>{MSG_TYPE_LABEL[t]}</option>
              ))}
            </select>
            <input style={S.input} value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="작성자" />
          </div>

          {messages.length > 0 && (
            <>
              <div style={S.refHint}>
                참조할 이전 메시지 선택 (사람 글 작성 시 근거로, AI 요청 시 &quot;이거 보고 답해줘&quot;로 쓰임)
              </div>
              <div style={S.refPicker}>
                {messages.map((m) => {
                  const selected = selectedRefs.has(m.id);
                  return (
                    <span
                      key={m.id}
                      onClick={() => toggleRef(m.id)}
                      style={{
                        ...S.refToggle,
                        background: selected ? 'rgba(88,166,255,0.15)' : 'var(--bg3)',
                        color: selected ? 'var(--accent)' : 'var(--text3)',
                        borderColor: selected ? 'var(--accent)' : 'var(--border)',
                      }}
                    >
                      {selected ? '✓ ' : ''}{m.content.slice(0, 20)}{m.content.length > 20 ? '…' : ''}
                    </span>
                  );
                })}
              </div>
            </>
          )}

          <textarea
            style={S.textarea}
            placeholder="이 방에 남길 메시지..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />

          <div style={S.btnRow}>
            <button
              style={{ ...S.submitBtn, ...(posting || !content.trim() ? S.submitOff : {}) }}
              onClick={submit}
              disabled={posting || !content.trim()}
            >
              {posting ? '⏳ 남기는 중...' : '방에 남기기'}
            </button>

            <button
              style={{ ...S.aiBtn, ...(aiResponding || messages.length === 0 ? S.submitOff : {}) }}
              onClick={requestAi}
              disabled={aiResponding || messages.length === 0}
              title="두뇌 AI가 이 방의 전체 기록을 읽고, 선택된(또는 가장 최근) 메시지에 답합니다"
            >
              {aiResponding ? '🤖 방을 읽는 중...' : '🤖 AI 답변 요청'}
            </button>
          </div>

          {errMsg && <div style={S.errMsg}>⚠ {errMsg}</div>}
        </div>
      </main>

      <style>{`
        .mobile-header-space { height: 0; }
        @media (max-width: 768px) {
          .mobile-header-space { height: 48px !important; }
        }
      `}</style>
    </div>
  );
}