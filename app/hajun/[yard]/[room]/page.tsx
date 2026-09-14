'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  HajunRoom, HajunMessage,
  MSG_TYPE_LABEL, MSG_TYPE_COLOR, MSG_TYPE_ORDER, MsgType, YARD_LABEL,
} from '@/types/hajun';

type DecisionValue = 'pass' | 'hold' | 'reject';

const S: Record<string, React.CSSProperties> = {
  page:  { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main:  { flex: 1, display: 'flex', flexDirection: 'column', maxHeight: '100vh', overflow: 'hidden', minWidth: 0 },
  header:{ padding: '16px 28px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', flexShrink: 0 },
  crumb: { fontSize: 12, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace', marginBottom: 6 },
  title: { fontSize: 20, fontWeight: 700 },

  body:      { flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: 760, scrollbarWidth: 'thin' as const, scrollbarColor: 'var(--border) transparent' },
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
  okMsg:     { fontSize: 12, color: '#3FB950', marginTop: 8 },
  decisionBox: { marginBottom: 12, padding: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 },
  decisionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text2)' },
  decisionHint: { fontSize: 11, color: 'var(--text3)', marginBottom: 8 },
};

function chip(type: MsgType) {
  const color = MSG_TYPE_COLOR[type];
  return <span style={{ ...S.chip, background: `${color}22`, color }}>{MSG_TYPE_LABEL[type]}</span>;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

/** 말풍선 1개 내용만 복사 */
function MessageCopyButton({ text }: { text: string }) {
  const [note, setNote] = useState('');
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
      <button
        type="button"
        onClick={async () => {
          const ok = await copyText(text);
          setNote(ok ? '이 메시지 복사됨' : '복사 실패');
          setTimeout(() => setNote(''), 1500);
        }}
        style={{ padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 11 }}
      >선택 복사</button>
      {note && <span style={{ fontSize: 11, color: '#3FB950' }}>{note}</span>}
    </div>
  );
}

function resolveInternalCode(messages: HajunMessage[], selectedRefs: Set<string>): string {
  const selected = messages.filter((m) => selectedRefs.has(m.id));
  for (const m of selected) {
    const code = m.metadata?.internal_code;
    if (typeof code === 'string' && code) return code;
  }
  for (const m of messages) {
    const entity = m.metadata?.entity_type;
    const code = m.metadata?.internal_code;
    if (
      typeof code === 'string' &&
      code &&
      (entity === 'product_candidate' ||
        entity === 'listing_draft' ||
        entity === 'listing_content' ||
        entity === 'listing_published' ||
        entity === 'product_validation_decision')
    ) {
      return code;
    }
  }
  return '';
}

function ProductMessage({ message, duplicateCount = 1, onSelectForValidation, onStartContent, onPublish }: {
  message: HajunMessage;
  duplicateCount?: number;
  onSelectForValidation?: (message: HajunMessage) => void;
  onStartContent?: (message: HajunMessage) => void;
  onPublish?: (message: HajunMessage) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const meta = message.metadata || {};
  const entity = String(meta.entity_type || '');

  if (entity === 'product_validation_decision') {
    const decision = String(meta.decision || '');
    const color = decision === 'pass' ? '#3FB950' : decision === 'hold' ? '#F0883E' : '#F78166';
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color, marginBottom: 6 }}>
          검증 결정: {decision || 'unknown'}
        </div>
        <div style={S.content}>{message.content}</div>
        {typeof meta.internal_code === 'string' && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
            internal_code: <b>{meta.internal_code}</b>
          </div>
        )}
        <MessageCopyButton text={message.content} />
      </div>
    );
  }

  if (entity === 'listing_draft' || entity === 'listing_content' || entity === 'listing_published') {
    const status = String(meta.status || '');
    const title = typeof meta.title_draft === 'string' ? meta.title_draft : '';
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
          {entity} · {status}
        </div>
        <div style={S.content}>{message.content}</div>
        {typeof meta.internal_code === 'string' && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text2)' }}>
            internal_code: <b>{meta.internal_code}</b>
          </div>
        )}
        {title && (
          <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text2)' }}>
            상품명 초안: <b>{title}</b>
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          {entity === 'listing_draft' && onStartContent && status !== 'published' && (
            <button
              type="button"
              onClick={() => onStartContent(message)}
              style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#58A6FF', color: '#0D1117', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
            >콘텐츠 시작</button>
          )}
          {entity === 'listing_content' && onPublish && status !== 'published' && (
            <button
              type="button"
              onClick={() => onPublish(message)}
              style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#3FB950', color: '#0D1117', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
            >게시 완료</button>
          )}
        </div>
        <MessageCopyButton text={message.content} />
      </div>
    );
  }

  const isProduct = entity === 'product_candidate';
  if (!isProduct) {
    const preview = message.content.trim();
    const clipped = preview.length > 260;
    return (
      <div>
        <div style={S.content}>{expanded || !clipped ? preview : `${preview.slice(0, 260)}…`}</div>
        {clipped && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            style={{ display: 'block', marginTop: 10, padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 11 }}
          >{expanded ? '원문 접기' : '원문 전체 보기'}</button>
        )}
        <MessageCopyButton text={message.content} />
      </div>
    );
  }
  const code = String(meta.internal_code || '').replace(/^onchannel:/, '');
  const name = String(meta.name || '') || (message.content.match(/제품명\s*\n([^\n]+)/)?.[1] || '상품명 확인 필요');
  const price = message.content.match(/판매사가\s*\n?([0-9,]+원)/)?.[1] || message.content.match(/판매사가\s*([0-9,]+원)/)?.[1] || '';
  const sourceUrl = String(meta.source_url || '');
  return (
    <div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{name}</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 11, color: 'var(--text2)' }}>
        <span>상품코드: <b>{code || '확인 필요'}</b></span>
        {price && <span>공급가: <b>{price}</b></span>}
        <span style={{ color: '#3FB950' }}>상품 후보</span>
        {duplicateCount > 1 && <span style={{ color: '#F0883E' }}>같은 상품 캡처 {duplicateCount}건</span>}
      </div>
      {sourceUrl && <a href={sourceUrl} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: 7, fontSize: 11, color: 'var(--accent)' }}>온채널 원문 열기 ↗</a>}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{ display: 'block', marginTop: 10, padding: '5px 9px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 11 }}
      >{expanded ? '원문 접기' : '원문 전체 보기'}</button>
      {expanded && <pre style={{ ...S.content, margin: '10px 0 0', maxHeight: 420, overflowY: 'auto', padding: 10, background: 'var(--bg3)', borderRadius: 6, whiteSpace: 'pre-wrap' }}>{message.content}</pre>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, alignItems: 'center' }}>
        {onSelectForValidation && (
          <button
            type="button"
            onClick={() => onSelectForValidation(message)}
            style={{ padding: '6px 12px', border: 'none', borderRadius: 6, background: '#3FB950', color: '#0D1117', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
          >검증 선택</button>
        )}
      </div>
      <MessageCopyButton text={message.content} />
    </div>
  );
}

export default function RoomPage() {
  const params = useParams();
  const yardKey = params.yard as string;
  const roomKey = params.room as string;

  const isValidationRoom = yardKey === 'product_validation' && roomKey === 'product_validation';
  const isDiscoveryRoom = yardKey === 'product_validation' && roomKey === 'product_discovery';
  const isListingQueueRoom = yardKey === 'product_listing' && roomKey === 'listing_queue';
  const isListingContentRoom = yardKey === 'product_listing' && roomKey === 'listing_content';

  const [room, setRoom]         = useState<HajunRoom | null>(null);
  const [messages, setMessages] = useState<HajunMessage[]>([]);
  const [loading, setLoading]   = useState(true);
  const [posting, setPosting]   = useState(false);
  const [aiResponding, setAiResponding] = useState(false);
  const [errMsg, setErrMsg]     = useState('');
  const [okMsg, setOkMsg]       = useState('');

  const [content, setContent]   = useState('');
  const [msgType, setMsgType]   = useState<MsgType>('question');
  const [authorName, setAuthorName] = useState('여리');
  const [selectedRefs, setSelectedRefs] = useState<Set<string>>(new Set());
  const [candidates, setCandidates] = useState<Array<{
    id: string;
    content: string;
    metadata?: Record<string, unknown> | null;
  }>>([]);
  const [pickedCode, setPickedCode] = useState('');
  const [pickedCandidateId, setPickedCandidateId] = useState('');
  const [roomCopyNote, setRoomCopyNote] = useState('');
  const [candidateError, setCandidateError] = useState('');
  const [candidateCount, setCandidateCount] = useState(0);
  const [titleDraft, setTitleDraft] = useState('');
  const [yardRooms, setYardRooms] = useState<HajunRoom[]>([]);

  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const listRes = await fetch(`/api/hajun?action=room_list&yard=${yardKey}`);
    const listJson = await listRes.json();
    const rooms: HajunRoom[] = listJson.payload?.rooms || [];
    setYardRooms(rooms);
    const found: HajunRoom | undefined = rooms.find(
      (r: HajunRoom) => r.key === roomKey
    );
    if (!found) { setLoading(false); return; }
    setRoom(found);

    const viewRes = await fetch(`/api/hajun?action=view_room&room_id=${found.id}`);
    const viewJson = await viewRes.json();
    const loadedMessages: HajunMessage[] = viewJson.payload?.messages || [];
    setMessages(loadedMessages);

    // 콘텐츠방: 최근 listing_content의 상품명 초안 복원
    if (yardKey === 'product_listing' && roomKey === 'listing_content') {
      const latestContent = [...loadedMessages].reverse().find(
        (m) => m.metadata?.entity_type === 'listing_content'
      );
      const prevTitle = latestContent?.metadata?.title_draft;
      if (typeof prevTitle === 'string' && prevTitle) {
        setTitleDraft(prevTitle);
      }
    }

    if (yardKey === 'product_validation') {
      try {
        const candRes = await fetch('/api/hajun?action=product_candidates');
        const candJson = await candRes.json();
        if (candJson._error) {
          setCandidateError(String(candJson._error));
          setCandidates([]);
          setCandidateCount(0);
        } else {
          const list = (candJson.payload?.candidates || []) as Array<{
            id: string;
            content: string;
            metadata?: Record<string, unknown> | null;
          }>;
          setCandidates(list);
          setCandidateCount(list.length);
          setCandidateError(list.length ? '' : '등록된 상품 후보가 없습니다. 상품발굴방에서 캡처가 필요합니다.');
        }
      } catch (e) {
        setCandidates([]);
        setCandidateCount(0);
        setCandidateError(e instanceof Error ? e.message : '상품 후보 조회 실패');
      }
    } else {
      setCandidates([]);
      setCandidateCount(0);
      setCandidateError('');
    }

    if (yardKey === 'product_validation' && roomKey === 'product_validation') {
      try {
        const raw = sessionStorage.getItem('hajun_validation_pick');
        if (raw) {
          const pick = JSON.parse(raw) as { id?: string; internal_code?: string };
          if (pick.id) setPickedCandidateId(pick.id);
          if (pick.internal_code) setPickedCode(pick.internal_code);
          sessionStorage.removeItem('hajun_validation_pick');
        }
      } catch {
        // ignore
      }
    }

    setLoading(false);
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
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
    setOkMsg('');
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

  const submitDecision = async (decision: DecisionValue) => {
    if (!room || posting) return;
    const internalCode = pickedCode || resolveInternalCode(messages, selectedRefs);
    if (!internalCode) {
      setErrMsg('상품 후보를 선택하세요. (상품 선택 목록 또는 참조)');
      return;
    }

    const reason = content.trim() || (
      decision === 'pass' ? '통과' : decision === 'hold' ? '보류' : '탈락'
    );
    const label = decision === 'pass' ? '통과' : decision === 'hold' ? '보류' : '탈락';

    setPosting(true);
    setErrMsg('');
    setOkMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: room.id,
          author_type: 'human',
          author_name: authorName || '검증자',
          msg_type: 'decision',
          content: `${label}: ${reason}`,
          ref_ids: Array.from(new Set([
            ...Array.from(selectedRefs),
            ...(pickedCandidateId ? [pickedCandidateId] : []),
          ])),
          metadata: {
            entity_type: 'product_validation_decision',
            decision,
            decision_reason: reason,
            decided_at: new Date().toISOString(),
            decided_by: 'human',
            internal_code: internalCode,
          },
        }),
      });
      const json = await res.json();
      if (json._error) {
        setErrMsg(json._error);
      } else {
        setContent('');
        setSelectedRefs(new Set());
        setPickedCode('');
        setPickedCandidateId('');
        if (decision === 'pass' && json.listing_draft?.id) {
          setOkMsg(`pass 완료 → 등록대기 listing_draft 생성됨 (${json.listing_draft.id.slice(0, 8)}…)`);
        } else if (decision === 'pass') {
          setOkMsg('pass 완료. listing_draft는 등록대기방에서 확인하세요.');
        } else {
          setOkMsg(`${label} 결정이 저장되었습니다.`);
        }
        await load();
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    } finally {
      setPosting(false);
    }
  };

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
  const visibleMessages = messages.filter((message, index, all) => {
    const code = message.metadata?.internal_code;
    return !code || all.findIndex((candidate) => candidate.metadata?.internal_code === code) === index;
  });
  const currentCode = pickedCode || resolveInternalCode(messages, selectedRefs);

  const selectForValidation = (message: HajunMessage) => {
    const code = typeof message.metadata?.internal_code === 'string' ? message.metadata.internal_code : '';
    if (!code) {
      setErrMsg('이 메시지에 internal_code가 없어 검증 대상으로 선택할 수 없습니다.');
      return;
    }
    try {
      sessionStorage.setItem('hajun_validation_pick', JSON.stringify({
        id: message.id,
        internal_code: code,
      }));
    } catch {
      // ignore
    }
    window.location.href = '/hajun/product_validation/product_validation';
  };

  const startContent = async (message: HajunMessage) => {
    if (posting) return;
    const code = typeof message.metadata?.internal_code === 'string' ? message.metadata.internal_code : '';
    if (!code) {
      setErrMsg('listing_draft에 internal_code가 없습니다.');
      return;
    }
    setPosting(true);
    setErrMsg('');
    setOkMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yard_key: 'product_listing',
          room_key: 'listing_content',
          author_type: 'human',
          author_name: authorName || '콘텐츠작업',
          msg_type: 'work_result',
          content: `콘텐츠 작업 시작: ${code}`,
          ref_ids: Array.from(new Set([message.id, ...(message.ref_ids || [])])),
          metadata: {
            entity_type: 'listing_content',
            internal_code: code,
            status: 'editing',
            title_draft: titleDraft || null,
            thumbnail_status: 'pending',
            detail_status: 'pending',
            target_malls: [],
            source_draft_id: message.id,
          },
        }),
      });
      const json = await res.json();
      if (json._error) {
        setErrMsg(json._error);
      } else {
        setOkMsg('콘텐츠제작방으로 이동했습니다.');
        window.location.href = '/hajun/product_listing/listing_content';
      }
    } finally {
      setPosting(false);
    }
  };

  const publishListing = async (message: HajunMessage) => {
    if (posting) return;
    const code = typeof message.metadata?.internal_code === 'string' ? message.metadata.internal_code : '';
    if (!code) {
      setErrMsg('listing_content에 internal_code가 없습니다.');
      return;
    }
    setPosting(true);
    setErrMsg('');
    setOkMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yard_key: 'product_listing',
          room_key: 'listing_published',
          author_type: 'human',
          author_name: authorName || '게시확인',
          msg_type: 'decision',
          content: `쇼핑몰 게시 완료 확인: ${code}${titleDraft ? ` / ${titleDraft}` : ''}`,
          ref_ids: Array.from(new Set([message.id, ...(message.ref_ids || [])])),
          metadata: {
            entity_type: 'listing_published',
            internal_code: code,
            status: 'published',
            title_draft: titleDraft || message.metadata?.title_draft || null,
            thumbnail_status: message.metadata?.thumbnail_status || 'done',
            detail_status: message.metadata?.detail_status || 'done',
            target_malls: message.metadata?.target_malls || [],
            source_content_id: message.id,
            published_at: new Date().toISOString(),
            published_by: 'human',
          },
        }),
      });
      const json = await res.json();
      if (json._error) {
        setErrMsg(json._error);
      } else {
        setOkMsg('등록완료방에 published 기록이 생성되었습니다.');
        window.location.href = '/hajun/product_listing/listing_published';
      }
    } finally {
      setPosting(false);
    }
  };

  const saveContentNote = async () => {
    if (!room || posting || !isListingContentRoom) return;
    // 방 안 listing_content / draft 계보에서 자동 추출 (참조 선택 불필요)
    const code =
      pickedCode ||
      resolveInternalCode(messages, selectedRefs) ||
      (() => {
        const latest = [...messages].reverse().find((m) => {
          const e = m.metadata?.entity_type;
          return e === 'listing_content' || e === 'listing_draft';
        });
        return typeof latest?.metadata?.internal_code === 'string'
          ? latest.metadata.internal_code
          : '';
      })();
    if (!code) {
      setErrMsg('이 방에 연결된 상품 코드가 없습니다. 등록대기에서 콘텐츠 시작을 다시 해주세요.');
      return;
    }
    const note = content.trim();
    const title = titleDraft.trim();
    if (!note && !title) {
      setErrMsg('상품명 초안 또는 작업 메모 중 하나는 입력하세요.');
      return;
    }
    // 최근 listing_content를 ref에 연결
    const latestContent = [...messages].reverse().find(
      (m) => m.metadata?.entity_type === 'listing_content'
    );
    setPosting(true);
    setErrMsg('');
    setOkMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: room.id,
          author_type: 'human',
          author_name: authorName || '콘텐츠작업',
          msg_type: 'work_result',
          content: note || `상품명 초안 저장: ${title}`,
          ref_ids: Array.from(new Set([
            ...Array.from(selectedRefs),
            ...(latestContent?.id ? [latestContent.id] : []),
            ...(pickedCandidateId ? [pickedCandidateId] : []),
          ])),
          metadata: {
            entity_type: 'listing_content',
            internal_code: code,
            status: 'editing',
            title_draft: title || null,
            thumbnail_status: 'pending',
            detail_status: 'pending',
            target_malls: [],
            note_only: !title && !!note,
          },
        }),
      });
      const json = await res.json();
      if (json._error) setErrMsg(json._error);
      else {
        setContent('');
        setOkMsg(title ? `상품명 초안 저장됨: ${title}` : '작업 메모가 저장되었습니다.');
        await load();
      }
    } finally {
      setPosting(false);
    }
  };

  const copyWholeRoom = async () => {
    const text = messages
      .map((m) => {
        const head = `[${m.msg_type}] ${m.author_name} · ${fmtTime(m.created_at)}`;
        return `${head}\n${m.content}`;
      })
      .join('\n\n---\n\n');
    const ok = await copyText(text || '(빈 방)');
    setRoomCopyNote(ok ? '방 전체 복사됨' : '복사 실패');
    setTimeout(() => setRoomCopyNote(''), 1500);
  };

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={S.title}>{room?.name || '방'}</div>
            <button
              type="button"
              onClick={copyWholeRoom}
              style={{ padding: '5px 10px', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg3)', color: 'var(--text2)', cursor: 'pointer', fontSize: 11 }}
            >전체 복사</button>
            {roomCopyNote && <span style={{ fontSize: 11, color: '#3FB950' }}>{roomCopyNote}</span>}
          </div>
          {yardRooms.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
              {yardRooms.map((r) => {
                const active = r.key === roomKey;
                return (
                  <Link
                    key={r.id}
                    href={`/hajun/${yardKey}/${r.key}`}
                    style={{
                      padding: '5px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      fontWeight: active ? 700 : 500,
                      textDecoration: 'none',
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: active ? 'rgba(88,166,255,0.15)' : 'var(--bg3)',
                      color: active ? 'var(--accent)' : 'var(--text2)',
                    }}
                  >{r.name}</Link>
                );
              })}
            </div>
          )}
        </div>

        <div style={S.body} className="msg-body">
          {loading && <div style={{ color: 'var(--text2)', fontSize: 13 }}>⏳ 로딩 중...</div>}
          {!loading && messages.length === 0 && (
            <div style={S.empty}>아직 이 방에 메시지가 없습니다. 아래에서 첫 메시지를 남겨보세요.</div>
          )}
          {visibleMessages.map((m) => (
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
              <ProductMessage
                message={m}
                duplicateCount={m.metadata?.internal_code
                  ? messages.filter((candidate) => candidate.metadata?.internal_code === m.metadata?.internal_code).length
                  : 1}
                onSelectForValidation={isDiscoveryRoom ? selectForValidation : undefined}
                onStartContent={isListingQueueRoom ? startContent : undefined}
                onPublish={isListingContentRoom ? publishListing : undefined}
              />
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
          {isListingQueueRoom && (
            <div style={S.decisionBox}>
              <div style={S.decisionTitle}>등록대기 → 콘텐츠</div>
              <div style={S.decisionHint}>
                listing_draft 카드의 <b>콘텐츠 시작</b>을 누르면 콘텐츠제작방으로 넘어갑니다.
                상품명 초안을 미리 적어두면 함께 전달됩니다.
              </div>
              <input
                style={{ ...S.input, width: '100%', marginBottom: 8 }}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="상품명 초안 (선택)"
              />
            </div>
          )}

          {isListingContentRoom && (
            <div style={S.decisionBox}>
              <div style={S.decisionTitle}>콘텐츠 작업</div>
              <div style={S.decisionHint}>
                상품명 초안 또는 메모만 적어도 저장됩니다 (둘 다 가능).
                쇼핑몰에 직접 반영한 뒤 카드의 <b>게시 완료</b>를 누르세요. 자동 게시 없음.
              </div>
              <input
                style={{ ...S.input, width: '100%', marginBottom: 8 }}
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                placeholder="상품명 초안 (선택)"
              />
              <div style={S.btnRow}>
                <button
                  type="button"
                  style={{ ...S.submitBtn, background: '#58A6FF', ...(posting ? S.submitOff : {}) }}
                  disabled={posting}
                  onClick={saveContentNote}
                >초안/메모 저장</button>
              </div>
            </div>
          )}

          {isValidationRoom && (
            <div style={S.decisionBox}>
              <div style={S.decisionTitle}>상품 검증 결정</div>
              <div style={S.decisionHint}>
                상품발굴방에서 <b>검증 선택</b> 하거나, 아래에서 후보를 고르세요.
                {currentCode ? ` · 대상: ${currentCode}` : ' · 대상 미선택'}
                {` · 후보 ${candidateCount}개`}
              </div>
              {candidateError && (
                <div style={{ ...S.errMsg, marginBottom: 8 }}>⚠ {candidateError}</div>
              )}
              <select
                style={{ ...S.select, width: '100%', marginBottom: 10, minHeight: 36 }}
                value={pickedCandidateId}
                onChange={(e) => {
                  const id = e.target.value;
                  setPickedCandidateId(id);
                  const found = candidates.find((c) => c.id === id);
                  const code = typeof found?.metadata?.internal_code === 'string'
                    ? found.metadata.internal_code
                    : '';
                  setPickedCode(code);
                }}
              >
                <option value="">상품 후보 선택...</option>
                {candidates.map((c) => {
                  const code = typeof c.metadata?.internal_code === 'string' ? c.metadata.internal_code : '';
                  const name = typeof c.metadata?.name === 'string'
                    ? c.metadata.name
                    : (c.content.split('\n')[0] || code || c.id).slice(0, 40);
                  return (
                    <option key={c.id} value={c.id}>
                      {(code || '코드없음').replace(/^onchannel:/, '')} · {name}
                    </option>
                  );
                })}
              </select>
              <div style={S.btnRow}>
                <button
                  type="button"
                  style={{ ...S.submitBtn, background: '#3FB950', ...(posting ? S.submitOff : {}) }}
                  disabled={posting}
                  onClick={() => submitDecision('pass')}
                >pass 통과</button>
                <button
                  type="button"
                  style={{ ...S.submitBtn, background: '#F0883E', ...(posting ? S.submitOff : {}) }}
                  disabled={posting}
                  onClick={() => submitDecision('hold')}
                >hold 보류</button>
                <button
                  type="button"
                  style={{ ...S.submitBtn, background: '#F78166', ...(posting ? S.submitOff : {}) }}
                  disabled={posting}
                  onClick={() => submitDecision('reject')}
                >reject 탈락</button>
              </div>
            </div>
          )}

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
                참조할 이전 메시지 선택 (검증 시 상품 후보 선택에 사용)
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
            placeholder={isValidationRoom ? '검증 사유 (선택). 비우면 기본 문구 사용' : isListingContentRoom ? '작업 메모 (선택). 상품명만 바꿔도 저장 가능' : '이 방에 남길 메시지...'}
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
          {okMsg && <div style={S.okMsg}>✅ {okMsg}</div>}
        </div>
      </main>

      <style>{`
        .mobile-header-space { height: 0; }
        .msg-body::-webkit-scrollbar { width: 6px; }
        .msg-body::-webkit-scrollbar-track { background: transparent; }
        .msg-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        .msg-body::-webkit-scrollbar-thumb:hover { background: var(--text3); }
        @media (max-width: 768px) {
          .mobile-header-space { height: 48px !important; }
        }
      `}</style>
    </div>
  );
}
