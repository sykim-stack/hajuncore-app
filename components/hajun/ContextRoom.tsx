'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  HajunRoom, HajunMessage,
  MSG_TYPE_LABEL, MSG_TYPE_COLOR, MsgType, YARD_LABEL,
} from '@/types/hajun';

const S: Record<string, React.CSSProperties> = {
  page: { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden', minWidth: 0 },
  header: { padding: '16px 28px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  crumb: { fontSize: 12, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: 700 },
  body: { flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: 760 },
  msgCard: { marginBottom: 16, padding: 14, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' },
  msgCardAi: { borderLeft: '3px solid #39C5CF' },
  msgTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  chip: { fontSize: 10, padding: '2px 8px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 },
  author: { fontSize: 12, fontWeight: 600 },
  time: { fontSize: 10, color: 'var(--text3)', marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' },
  content: { fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const },
  compose: { borderTop: '1px solid var(--border)', background: 'var(--bg2)', padding: '14px 24px 18px', flexShrink: 0 },
  input: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12, outline: 'none', width: '100%' },
  select: { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '7px 10px', fontSize: 12, outline: 'none', width: '100%', marginBottom: 10 },
  textarea: { width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', padding: '10px 14px', fontSize: 13, outline: 'none', resize: 'vertical' as const, minHeight: 70, marginBottom: 8 },
  btnRow: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, alignItems: 'center' },
  submitBtn: { padding: '9px 16px', background: 'var(--accent)', color: '#0D1117', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer' },
  submitOff: { background: 'var(--bg3)', color: 'var(--text3)', cursor: 'not-allowed' },
  errMsg: { fontSize: 12, color: 'var(--warn)', marginTop: 8 },
  okMsg: { fontSize: 12, color: '#3FB950', marginTop: 8 },
  empty: { fontSize: 13, color: 'var(--text3)', padding: '40px 0', textAlign: 'center' },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function ContextRoom({ yardKey, roomKey }: { yardKey: string; roomKey: string }) {
  const [room, setRoom] = useState<HajunRoom | null>(null);
  const [messages, setMessages] = useState<HajunMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [aiPosting, setAiPosting] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('여리');
  const [msgType, setMsgType] = useState<MsgType>('understanding');
  const [refIds, setRefIds] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const listRes = await fetch(`/api/hajun?action=room_list&yard=${yardKey}`);
    const listJson = await listRes.json();
    const rooms: HajunRoom[] = listJson.payload?.rooms || [];
    const found = rooms.find((r) => r.key === roomKey);
    if (!found) { setLoading(false); return; }
    setRoom(found);
    const viewRes = await fetch(`/api/hajun?action=view_room&room_id=${found.id}`);
    const viewJson = await viewRes.json();
    setMessages(viewJson.payload?.messages || []);
    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
  }, [yardKey, roomKey]);

  useEffect(() => { load(); }, [load]);

  const clearRefs = () => setRefIds([]);
  const toggleRef = (id: string) => {
    setRefIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };
  const chipLabel = (m: HajunMessage) => {
    const body = (m.content || '').replace(/\s+/g, ' ').trim();
    return body.length > 36 ? body.slice(0, 36) + '…' : body || '(빈 메시지)';
  };

  const submitContext = async () => {
    if (!room || !content.trim() || posting) return;
    setPosting(true); setErrMsg(''); setOkMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: room.id, author_type: 'human', author_name: authorName || '여리',
          msg_type: msgType, content: content.trim(), ref_ids: refIds,
        }),
      });
      const json = await res.json();
      if (json._error) setErrMsg(json._error);
      else {
        setContent(''); clearRefs();
        setOkMsg(refIds.length ? `저장됨 · 참조 ${refIds.length}건` : '저장됨');
        await load();
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
    } finally { setPosting(false); }
  };

  const askAiContext = async () => {
    if (!room || aiPosting) return;
    setAiPosting(true); setErrMsg(''); setOkMsg('');
    try {
      const res = await fetch('/api/hajun?action=ai_respond', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: room.id, ref_ids: refIds }),
      });
      const json = await res.json();
      if (json._error) setErrMsg(json._error);
      else {
        setOkMsg(refIds.length ? `HajunAI 답변 · 참조 ${refIds.length}건` : 'HajunAI 답변 저장됨');
        clearRefs(); await load();
      }
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
    } finally { setAiPosting(false); }
  };

  if (loading) return <div style={S.page}><Sidebar /><main style={S.main}><div style={S.empty}>로딩...</div></main></div>;
  if (!room) return <div style={S.page}><Sidebar /><main style={S.main}><div style={S.empty}>방을 찾을 수 없습니다.</div></main></div>;

  const MSG_TYPES: MsgType[] = ['question', 'understanding', 'answer', 'decision', 'issue', 'doc_injection', 'work_result'];
  const chipMessages = [...messages].slice(-40).reverse();

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div style={S.header}>
          <div style={S.crumb}>
            <Link href="/hajun" style={{ color: 'var(--text3)' }}>하준아이</Link>
            {' / '}
            <span style={{ color: 'var(--text3)' }}>{YARD_LABEL[yardKey] || yardKey}</span>
            {' / '}{room.name}
          </div>
          <div style={S.title}>{room.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 4, lineHeight: 1.5 }}>
            맥락 방 · 아래 칩으로 참조할 이전 메시지를 고른 뒤 남기거나 AI 답변을 요청하세요
          </div>
        </div>

        <div style={S.body}>
          {messages.length === 0 && <div style={S.empty}>메시지가 없습니다. 첫 맥락을 남겨 보세요.</div>}
          {messages.map((m) => {
            const selected = refIds.includes(m.id);
            return (
              <div key={m.id} style={{
                ...S.msgCard,
                ...(m.author_type === 'ai' ? S.msgCardAi : {}),
                ...(selected ? { borderColor: 'var(--accent)', boxShadow: '0 0 0 1px var(--accent)' } : {}),
              }}>
                <div style={S.msgTop}>
                  <span style={{ ...S.chip, background: `${MSG_TYPE_COLOR[m.msg_type as MsgType] || '#484F58'}22`, color: MSG_TYPE_COLOR[m.msg_type as MsgType] || '#8B949E' }}>
                    {MSG_TYPE_LABEL[m.msg_type as MsgType] || m.msg_type}
                  </span>
                  <span style={S.author}>{m.author_name}</span>
                  <span style={S.time}>{fmtTime(m.created_at)}</span>
                </div>
                <div style={S.content}>{m.content}</div>
                <div style={{ marginTop: 8 }}>
                  <button type="button"
                    style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer', fontFamily: 'JetBrains Mono, monospace' }}
                    onClick={() => toggleRef(m.id)}>
                    {selected ? '참조 해제' : '이어가기'}
                  </button>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        <div style={S.compose}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8, alignItems: 'center' }}>
            <select style={{ ...S.select, width: 140, marginBottom: 0 }} value={msgType} onChange={(e) => setMsgType(e.target.value as MsgType)}>
              {MSG_TYPES.map((t) => <option key={t} value={t}>{MSG_TYPE_LABEL[t]}</option>)}
            </select>
            <input style={{ ...S.input, width: 120 }} value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="작성자" />
          </div>

          <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6, fontFamily: 'JetBrains Mono, monospace' }}>
            참조할 이전 메시지 선택 · {refIds.length}건
            {refIds.length > 0 && (
              <button type="button"
                style={{ marginLeft: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }}
                onClick={clearRefs}>
                전체 해제
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 88, overflowY: 'auto', marginBottom: 10, padding: '2px 0' }}>
            {chipMessages.map((m) => {
              const on = refIds.includes(m.id);
              return (
                <button key={m.id} type="button" title={m.content}
                  style={{
                    fontSize: 11, padding: '5px 10px', borderRadius: 16,
                    border: on ? '1px solid var(--accent)' : '1px solid var(--border)',
                    background: on ? 'rgba(88,166,255,0.12)' : 'var(--bg3)',
                    color: on ? 'var(--accent)' : 'var(--text2)',
                    cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}
                  onClick={() => toggleRef(m.id)}>
                  {chipLabel(m)}
                </button>
              );
            })}
          </div>

          <textarea style={S.textarea} value={content} onChange={(e) => setContent(e.target.value)} placeholder="맥락을 남겨 주세요..." />
          <div style={S.btnRow}>
            <button type="button" style={{ ...S.submitBtn, ...(!content.trim() || posting ? S.submitOff : {}) }} disabled={!content.trim() || posting} onClick={submitContext}>
              {posting ? '저장 중...' : '방에 남기기'}
            </button>
            <button type="button" style={{ ...S.submitBtn, background: '#39C5CF', ...(aiPosting ? S.submitOff : {}) }} disabled={aiPosting || posting} onClick={askAiContext}>
              {aiPosting ? 'HajunAI 응답 중...' : 'AI 답변 요청'}
            </button>
          </div>
          {errMsg && <div style={S.errMsg}>⚠ {errMsg}</div>}
          {okMsg && <div style={S.okMsg}>✅ {okMsg}</div>}
        </div>
      </main>
    </div>
  );
}
