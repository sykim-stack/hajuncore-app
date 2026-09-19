'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  HajunRoom, HajunMessage,
  MSG_TYPE_LABEL, MSG_TYPE_COLOR, MsgType, YARD_LABEL,
} from '@/types/hajun';

type DecisionValue = 'pass' | 'hold' | 'reject';
type ContentWorkStatus = 'pending' | 'source' | 'editing' | 'draft' | 'review' | 'approved';

const CONTENT_STATUS_FLOW: ContentWorkStatus[] = ['pending', 'source', 'editing', 'draft', 'review', 'approved'];
const CONTENT_STATUS_LABEL: Record<ContentWorkStatus, string> = {
  pending: '미착수',
  source: '원본확보',
  editing: '작업중',
  draft: '초안',
  review: '검토',
  approved: '승인',
};

function normalizeWorkStatus(v: unknown): ContentWorkStatus {
  if (v === 'done') return 'approved';
  if (typeof v === 'string' && (CONTENT_STATUS_FLOW as string[]).includes(v)) return v as ContentWorkStatus;
  return 'pending';
}

function nextWorkStatus(cur: ContentWorkStatus): ContentWorkStatus | null {
  const i = CONTENT_STATUS_FLOW.indexOf(cur);
  if (i < 0 || i >= CONTENT_STATUS_FLOW.length - 1) return null;
  return CONTENT_STATUS_FLOW[i + 1];
}

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
  decisionBox: { marginBottom: 12, padding: 12, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 },
  decisionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 8, color: 'var(--text2)' },
  decisionHint: { fontSize: 11, color: 'var(--text3)', marginBottom: 8 },
  errMsg: { fontSize: 12, color: 'var(--warn)', marginTop: 8 },
  okMsg: { fontSize: 12, color: '#3FB950', marginTop: 8 },
  empty: { fontSize: 13, color: 'var(--text3)', padding: '40px 0', textAlign: 'center' },
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function extractProductName(content: string, metadata?: Record<string, unknown> | null): string {
  if (typeof metadata?.name === 'string' && metadata.name.trim()) return metadata.name.trim();
  if (typeof metadata?.product_name === 'string' && metadata.product_name.trim()) return metadata.product_name.trim();
  if (typeof metadata?.title_draft === 'string' && metadata.title_draft.trim()) return metadata.title_draft.trim();
  const fromContent =
    content.match(/제품명\s*\n([^\n]+)/)?.[1]?.trim() ||
    content.match(/상품명\s*[:：]?\s*([^\n]+)/)?.[1]?.trim() ||
    content.match(/제품명\s*[:：]?\s*([^\n]+)/)?.[1]?.trim() ||
    '';
  if (fromContent && !fromContent.startsWith('검증 통과') && !fromContent.startsWith('콘텐츠 작업') && !fromContent.startsWith('onchannel:')) {
    return fromContent.slice(0, 80);
  }
  return '';
}
function displayCode(code: string) {
  return (code || '').replace(/^onchannel:/, '') || '코드없음';
}

type Cand = { id: string; content: string; metadata?: Record<string, unknown> | null };

export default function RoomPage() {
  const params = useParams();
  const yardKey = params.yard as string;
  const roomKey = params.room as string;
  const isValidationRoom = yardKey === 'product_validation' && roomKey === 'product_validation';
  const isDiscoveryRoom = yardKey === 'product_validation' && roomKey === 'product_discovery';
  const isListingQueueRoom = yardKey === 'product_listing' && roomKey === 'listing_queue';
  const isListingContentRoom = yardKey === 'product_listing' && roomKey === 'listing_content';
  const isProductYard = yardKey === 'product_validation' || yardKey === 'product_listing';
  const isContextYard = !isProductYard;

  const [room, setRoom] = useState<HajunRoom | null>(null);
  const [messages, setMessages] = useState<HajunMessage[]>([]);
  const [yardRooms, setYardRooms] = useState<HajunRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [errMsg, setErrMsg] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [content, setContent] = useState('');
  const [authorName, setAuthorName] = useState('여리');
  const [candidates, setCandidates] = useState<Cand[]>([]);
  const [pickedCode, setPickedCode] = useState('');
  const [pickedCandidateId, setPickedCandidateId] = useState('');
  const [candidateCount, setCandidateCount] = useState(0);
  const [candidateError, setCandidateError] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [thumbStatus, setThumbStatus] = useState<ContentWorkStatus>('pending');
  const [detailStatus, setDetailStatus] = useState<ContentWorkStatus>('pending');
  const [nameByCode, setNameByCode] = useState<Record<string, string>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [msgType, setMsgType] = useState<MsgType>('understanding');
  const [aiPosting, setAiPosting] = useState(false);
  const [refIds, setRefIds] = useState<string[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const listRes = await fetch(`/api/hajun?action=room_list&yard=${yardKey}`);
    const listJson = await listRes.json();
    const rooms: HajunRoom[] = listJson.payload?.rooms || [];
    setYardRooms(rooms);
    const found = rooms.find((r) => r.key === roomKey);
    if (!found) { setLoading(false); return; }
    setRoom(found);
    const viewRes = await fetch(`/api/hajun?action=view_room&room_id=${found.id}`);
    const viewJson = await viewRes.json();
    const loaded: HajunMessage[] = viewJson.payload?.messages || [];
    setMessages(loaded);

    if (yardKey === 'product_validation' || yardKey === 'product_listing') {
      try {
        const res = await fetch('/api/hajun?action=product_candidates');
        const json = await res.json();
        const list = (json.payload?.candidates || []) as Cand[];
        const map: Record<string, string> = {};
        for (const c of list) {
          const code = typeof c.metadata?.internal_code === 'string' ? c.metadata.internal_code : '';
          if (!code) continue;
          const nm = extractProductName(c.content || '', c.metadata);
          if (!nm) continue;
          map[code] = nm;
          const short = code.replace(/^onchannel:/, '');
          if (short && short !== code) map[short] = nm;
          if (!code.startsWith('onchannel:') && short) map[`onchannel:${short}`] = nm;
        }
        setNameByCode(map);
        if (yardKey === 'product_validation') {
          setCandidates(list);
          setCandidateCount(list.length);
          setCandidateError(list.length ? '' : '상품 후보가 없습니다.');
        }
      } catch (e) {
        if (yardKey === 'product_validation') {
          setCandidateError(e instanceof Error ? e.message : '후보 조회 실패');
        }
      }
    }

    if (yardKey === 'product_listing') {
      try {
        const res = await fetch('/api/hajun?action=listing_queue');
        const json = await res.json();
        const items = (json.payload?.items || []) as Cand[];
        const byCode = new Map<string, Cand>();
        for (const item of items) {
          const code = typeof item.metadata?.internal_code === 'string' ? item.metadata.internal_code : '';
          if (!code || byCode.has(code)) continue;
          byCode.set(code, item);
        }
        for (const m of loaded) {
          const e = String(m.metadata?.entity_type || '');
          if (e !== 'listing_content' && e !== 'listing_draft') continue;
          const code = typeof m.metadata?.internal_code === 'string' ? m.metadata.internal_code : '';
          if (!code || byCode.has(code)) continue;
          byCode.set(code, { id: m.id, content: m.content, metadata: m.metadata });
        }
        const list = Array.from(byCode.values());
        setCandidates(list); setCandidateCount(list.length);
        setCandidateError(list.length ? '' : '등록대기 상품이 없습니다.');
        let applied = false;
        try {
          const raw = sessionStorage.getItem('hajun_listing_pick');
          if (raw) {
            const pick = JSON.parse(raw) as { id?: string; internal_code?: string; title_draft?: string };
            sessionStorage.removeItem('hajun_listing_pick');
            if (pick.internal_code) {
              setPickedCode(pick.internal_code);
              const match = list.find((c) => c.metadata?.internal_code === pick.internal_code);
              if (match?.id) setPickedCandidateId(match.id);
              if (pick.title_draft) setTitleDraft(pick.title_draft);
              applied = true;
            }
          }
        } catch { /* ignore */ }
        if (!applied && list.length === 1) {
          setPickedCandidateId(list[0].id);
          const code = typeof list[0].metadata?.internal_code === 'string' ? list[0].metadata.internal_code : '';
          if (code) setPickedCode(code);
        }
      } catch (e) { setCandidateError(e instanceof Error ? e.message : '등록 상품 조회 실패'); }
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
      } catch { /* ignore */ }
    }
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

  const currentCode = pickedCode;

  const submitDecision = async (decision: DecisionValue) => {
    if (!room || posting || !currentCode) { setErrMsg('상품을 선택하세요.'); return; }
    setPosting(true); setErrMsg(''); setOkMsg('');
    try {
      const reason = content.trim() || (decision === 'pass' ? '통과' : decision === 'hold' ? '보류' : '탈락');
      const label = decision === 'pass' ? '통과' : decision === 'hold' ? '보류' : '탈락';
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: room.id, author_type: 'human', author_name: authorName || '검증자',
          msg_type: 'decision', content: `${label}: ${reason}`,
          ref_ids: pickedCandidateId ? [pickedCandidateId] : [],
          metadata: {
            entity_type: 'product_validation_decision', decision, decision_reason: reason,
            decided_at: new Date().toISOString(), decided_by: 'human', internal_code: currentCode,
          },
        }),
      });
      const json = await res.json();
      if (json._error) setErrMsg(json._error);
      else {
        setOkMsg(decision === 'pass' ? 'pass 완료. 등록대기방으로 이동' : `${label} 저장됨`);
        setContent(''); setPickedCode(''); setPickedCandidateId('');
        if (decision === 'pass') { window.location.href = '/hajun/product_listing/listing_queue'; return; }
        await load();
      }
    } finally { setPosting(false); }
  };

  const startContent = async (message: HajunMessage) => {
    const code = typeof message.metadata?.internal_code === 'string' ? message.metadata.internal_code : '';
    if (!code || posting) return;
    setPosting(true); setErrMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yard_key: 'product_listing', room_key: 'listing_content',
          author_type: 'human', author_name: authorName || '콘텐츠작업', msg_type: 'work_result',
          content: `콘텐츠 작업 시작: ${code}`,
          ref_ids: [message.id, ...(message.ref_ids || [])],
          metadata: {
            entity_type: 'listing_content', internal_code: code, status: 'editing',
            title_draft: titleDraft || null, thumbnail_status: 'pending', detail_status: 'pending',
            target_malls: [], source_draft_id: message.id,
          },
        }),
      });
      const json = await res.json();
      if (json._error) setErrMsg(json._error);
      else {
        try {
          sessionStorage.setItem('hajun_listing_pick', JSON.stringify({ id: message.id, internal_code: code, title_draft: titleDraft }));
        } catch { /* ignore */ }
        window.location.href = '/hajun/product_listing/listing_content';
      }
    } finally { setPosting(false); }
  };

  const suggestTitle = async () => {
    if (!currentCode || suggesting) { setErrMsg('상품을 먼저 선택하세요.'); return; }
    setSuggesting(true); setErrMsg(''); setOkMsg('');
    try {
      const res = await fetch('/api/hajun?action=suggest_listing_title', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ internal_code: currentCode, room_id: room?.id }),
      });
      const json = await res.json();
      if (json._error) setErrMsg(json._error);
      else {
        const list = (json.payload?.suggestions || []) as string[];
        setTitleSuggestions(list);
        if (list[0]) setTitleDraft(list[0]);
        setOkMsg(list.length ? `상품명 ${list.length}개 추천` : '추천 없음');
      }
    } finally { setSuggesting(false); }
  };

  const saveContentNote = async () => {
    if (!room || !currentCode || posting) { setErrMsg('상품을 선택하세요.'); return; }
    const title = titleDraft.trim();
    const note = content.trim();
    if (!title && !note) { setErrMsg('상품명 또는 메모 필요'); return; }
    setPosting(true); setErrMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: room.id, author_type: 'human', author_name: authorName || '콘텐츠작업',
          msg_type: 'work_result', content: note || `상품명 초안 저장: ${title}`,
          ref_ids: pickedCandidateId ? [pickedCandidateId] : [],
          metadata: {
            entity_type: 'listing_content', internal_code: currentCode, status: 'editing',
            title_draft: title || null, thumbnail_status: thumbStatus, detail_status: detailStatus, target_malls: [],
          },
        }),
      });
      const json = await res.json();
      if (json._error) setErrMsg(json._error);
      else { setOkMsg(title ? `초안 저장: ${title}` : '메모 저장'); setContent(''); await load(); }
    } finally { setPosting(false); }
  };

  const advanceWorkStatus = async (kind: 'thumbnail' | 'detail') => {
    if (!room || !currentCode || posting) { setErrMsg('상품을 선택하세요.'); return; }
    const cur = kind === 'thumbnail' ? thumbStatus : detailStatus;
    const nxt = nextWorkStatus(cur);
    if (!nxt) { setOkMsg(`${kind === 'thumbnail' ? '이미지' : '상세'}는 이미 승인 상태입니다.`); return; }
    setPosting(true); setErrMsg('');
    const nextThumb = kind === 'thumbnail' ? nxt : thumbStatus;
    const nextDetail = kind === 'detail' ? nxt : detailStatus;
    try {
      const label = kind === 'thumbnail' ? '이미지' : '상세';
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: room.id, author_type: 'human', author_name: authorName || '콘텐츠작업',
          msg_type: 'work_result',
          content: `${label} 상태: ${CONTENT_STATUS_LABEL[cur]} → ${CONTENT_STATUS_LABEL[nxt]}`,
          ref_ids: pickedCandidateId ? [pickedCandidateId] : [],
          metadata: {
            entity_type: 'listing_content', internal_code: currentCode,
            status: nxt === 'approved' ? 'ready' : 'editing',
            title_draft: titleDraft.trim() || null,
            thumbnail_status: nextThumb, detail_status: nextDetail, target_malls: [], work_kind: kind,
          },
        }),
      });
      const json = await res.json();
      if (json._error) setErrMsg(json._error);
      else {
        if (kind === 'thumbnail') setThumbStatus(nxt); else setDetailStatus(nxt);
        setOkMsg(`${label}: ${CONTENT_STATUS_LABEL[nxt]}`);
        await load();
      }
    } finally { setPosting(false); }
  };

  const publishListing = async (message: HajunMessage) => {
    const code = typeof message.metadata?.internal_code === 'string' ? message.metadata.internal_code : currentCode;
    if (!code || posting) return;
    setPosting(true); setErrMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yard_key: 'product_listing', room_key: 'listing_published',
          author_type: 'human', author_name: authorName || '게시확인', msg_type: 'work_result',
          content: `쇼핑몰 게시 완료 확인: ${code}${titleDraft ? ` / ${titleDraft}` : ''}`,
          ref_ids: [message.id],
          metadata: {
            entity_type: 'listing_published', internal_code: code, status: 'published',
            title_draft: titleDraft || message.metadata?.title_draft || null,
            source_content_id: message.id,
          },
        }),
      });
      const json = await res.json();
      if (json._error) setErrMsg(json._error);
      else { setOkMsg('게시 완료 기록됨'); await load(); }
    } finally { setPosting(false); }
  };

  const submit = async () => {
    if (!room || !content.trim() || posting) return;
    setPosting(true); setErrMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: room.id, author_type: 'human', author_name: authorName || '익명',
          msg_type: 'question', content: content.trim(), ref_ids: [],
        }),
      });
      const json = await res.json();
      if (json._error) setErrMsg(json._error);
      else { setContent(''); await load(); }
    } finally { setPosting(false); }
  };

  if (loading) return <div style={S.page}><Sidebar /><main style={S.main}><div style={S.empty}>로딩...</div></main></div>;
  if (!room) return <div style={S.page}><Sidebar /><main style={S.main}><div style={S.empty}>방을 찾을 수 없습니다.</div></main></div>;

  if (isContextYard) {
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
            <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 10 }}>
              맥락 방 · 아래 칩으로 참조할 이전 메시지를 고른 뒤 남기거나 AI 답변을 요청하세요
            </div>
          </div>
          <div style={S.body}>
            {messages.length === 0 && <div style={S.empty}>메시지가 없습니다. 첫 맥락을 남겨 보세요.</div>}
            {messages.map((m) => {
              const selected = refIds.includes(m.id);
              return (
                <div key={m.id} style={{ ...S.msgCard, ...(m.author_type === 'ai' ? S.msgCardAi : {}), ...(selected ? { borderColor: 'var(--accent)' } : {}) }}>
                  <div style={S.msgTop}>
                    <span style={{ ...S.chip, background: MSG_TYPE_COLOR[m.msg_type as MsgType] || '#484F58', color: '#fff' }}>
                      {MSG_TYPE_LABEL[m.msg_type as MsgType] || m.msg_type}
                    </span>
                    <span style={S.author}>{m.author_name}</span>
                    <span style={S.time}>{fmtTime(m.created_at)}</span>
                  </div>
                  <div style={S.content}>{m.content}</div>
                  <div style={{ marginTop: 8 }}>
                    <button type="button" style={{ background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }} onClick={() => toggleRef(m.id)}>
                      {selected ? '참조 해제' : '참조에 추가'}
                    </button>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
          <div style={S.compose}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <select style={{ ...S.select, width: 140, marginBottom: 0 }} value={msgType} onChange={(e) => setMsgType(e.target.value as MsgType)}>
                {MSG_TYPES.map((t) => <option key={t} value={t}>{MSG_TYPE_LABEL[t]}</option>)}
              </select>
              <input style={{ ...S.input, width: 120 }} value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="작성자" />
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>
              참조할 이전 메시지 선택 · {refIds.length}건
              {refIds.length > 0 && <button type="button" style={{ marginLeft: 8, background: 'none', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: 4, padding: '2px 8px', fontSize: 10, cursor: 'pointer' }} onClick={clearRefs}>전체 해제</button>}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 88, overflowY: 'auto', marginBottom: 10 }}>
              {chipMessages.map((m) => {
                const on = refIds.includes(m.id);
                return (
                  <button key={m.id} type="button" title={m.content}
                    style={{ fontSize: 11, padding: '5px 10px', borderRadius: 16, border: on ? '1px solid var(--accent)' : '1px solid var(--border)', background: on ? 'rgba(88,166,255,0.12)' : 'var(--bg3)', color: on ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onClick={() => toggleRef(m.id)}>
                    {chipLabel(m)}
                  </button>
                );
              })}
            </div>
            <textarea style={S.textarea} value={content} onChange={(e) => setContent(e.target.value)} placeholder="이 방에 남길 메시지..." />
            <div style={S.btnRow}>
              <button type="button" style={{ ...S.submitBtn, ...(!content.trim() || posting ? S.submitOff : {}) }} disabled={!content.trim() || posting} onClick={submitContext}>
                {posting ? '저장 중...' : '방에 남기기'}
              </button>
              <button type="button" style={{ ...S.submitBtn, background: '#39C5CF', ...(aiPosting ? S.submitOff : {}) }} disabled={aiPosting || posting} onClick={askAiContext}>
                {aiPosting ? 'AI 응답 중...' : 'AI 답변 요청'}
              </button>
            </div>
            {errMsg && <div style={S.errMsg}>⚠ {errMsg}</div>}
            {okMsg && <div style={S.okMsg}>✅ {okMsg}</div>}
          </div>
        </main>
      </div>
    );
  }

  const productSelect = (
    <select style={S.select} value={pickedCandidateId} onChange={(e) => {
      const id = e.target.value; setPickedCandidateId(id);
      const c = candidates.find((x) => x.id === id);
      const code = typeof c?.metadata?.internal_code === 'string' ? c.metadata.internal_code : '';
      setPickedCode(code);
      const td = typeof c?.metadata?.title_draft === 'string' ? c.metadata.title_draft : '';
      if (td) setTitleDraft(td);
    }}>
      <option value="">상품 선택...</option>
      {candidates.map((c) => {
        const code = typeof c.metadata?.internal_code === 'string' ? c.metadata.internal_code : c.id;
        const nm = nameByCode[code] || extractProductName(c.content, c.metadata);
        return <option key={c.id} value={c.id}>{displayCode(code)}{nm ? ` · ${nm}` : ''}</option>;
      })}
    </select>
  );

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
        </div>
        <div style={S.body}>
          {messages.length === 0 && <div style={S.empty}>메시지가 없습니다.</div>}
          {messages.map((m) => {
            const entity = String(m.metadata?.entity_type || '');
            const code = typeof m.metadata?.internal_code === 'string' ? m.metadata.internal_code : '';
            return (
              <div key={m.id} style={{ ...S.msgCard, ...(m.author_type === 'ai' ? S.msgCardAi : {}) }}>
                <div style={S.msgTop}>
                  <span style={{ ...S.chip, background: MSG_TYPE_COLOR[m.msg_type as MsgType] || '#484F58', color: '#fff' }}>
                    {MSG_TYPE_LABEL[m.msg_type as MsgType] || m.msg_type}
                  </span>
                  <span style={S.author}>{m.author_name}</span>
                  {code && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{displayCode(code)}</span>}
                  <span style={S.time}>{fmtTime(m.created_at)}</span>
                </div>
                <div style={S.content}>{m.content}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {isListingQueueRoom && entity === 'listing_draft' && (
                    <button type="button" style={{ ...S.submitBtn, background: '#8B5CF6' }} onClick={() => startContent(m)}>콘텐츠 작업 시작</button>
                  )}
                  {isListingContentRoom && entity === 'listing_content' && String(m.metadata?.status) !== 'published' && (
                    <button type="button" style={{ ...S.submitBtn, background: '#3FB950' }} onClick={() => publishListing(m)}>게시 완료</button>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
        <div style={S.compose}>
          {isValidationRoom && (
            <div style={S.decisionBox}>
              <div style={S.decisionTitle}>상품 검증 결정</div>
              <div style={S.decisionHint}>{currentCode ? `대상: ${displayCode(currentCode)}` : '대상 미선택'} · 후보 {candidateCount}개</div>
              {candidateError && <div style={S.errMsg}>⚠ {candidateError}</div>}
              {productSelect}
              <div style={S.btnRow}>
                <button type="button" style={{ ...S.submitBtn, background: '#3FB950' }} disabled={posting || !currentCode} onClick={() => submitDecision('pass')}>pass</button>
                <button type="button" style={{ ...S.submitBtn, background: '#F0883E' }} disabled={posting || !currentCode} onClick={() => submitDecision('hold')}>hold</button>
                <button type="button" style={{ ...S.submitBtn, background: '#F78166' }} disabled={posting || !currentCode} onClick={() => submitDecision('reject')}>reject</button>
              </div>
            </div>
          )}
          {isListingContentRoom && (
            <div style={S.decisionBox}>
              <div style={S.decisionTitle}>콘텐츠 작업</div>
              <div style={S.decisionHint}>{currentCode ? `대상: ${displayCode(currentCode)}` : '대상 미선택'} · {candidateCount}개</div>
              {productSelect}
              <div style={S.btnRow}>
                <button type="button" style={{ ...S.submitBtn, background: '#39C5CF', ...(!currentCode || suggesting ? S.submitOff : {}) }}
                  disabled={!currentCode || suggesting || posting} onClick={suggestTitle}>
                  {suggesting ? '추천 중...' : 'AI 상품명 추천'}
                </button>
              </div>
              {titleSuggestions.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, margin: '10px 0' }}>
                  {titleSuggestions.map((s) => (
                    <button key={s} type="button" onClick={() => setTitleDraft(s)}
                      style={{ textAlign: 'left', padding: '8px 10px', borderRadius: 6,
                        border: titleDraft === s ? '1px solid var(--accent)' : '1px solid var(--border)',
                        background: titleDraft === s ? 'rgba(88,166,255,0.12)' : 'var(--bg)', color: 'var(--text)', cursor: 'pointer', fontSize: 12 }}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <input style={{ ...S.input, marginBottom: 8 }} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} placeholder="상품명 초안" />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  이미지: <strong>{CONTENT_STATUS_LABEL[thumbStatus]}</strong>
                  <button type="button" style={{ ...S.submitBtn, background: '#8B5CF6', padding: '6px 12px', fontSize: 12, marginLeft: 8, ...(!currentCode || !nextWorkStatus(thumbStatus) || posting ? S.submitOff : {}) }}
                    disabled={!currentCode || !nextWorkStatus(thumbStatus) || posting}
                    onClick={() => advanceWorkStatus('thumbnail')}>
                    {nextWorkStatus(thumbStatus) ? `→ ${CONTENT_STATUS_LABEL[nextWorkStatus(thumbStatus)!]}` : '승인 완료'}
                  </button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  상세: <strong>{CONTENT_STATUS_LABEL[detailStatus]}</strong>
                  <button type="button" style={{ ...S.submitBtn, background: '#8B5CF6', padding: '6px 12px', fontSize: 12, marginLeft: 8, ...(!currentCode || !nextWorkStatus(detailStatus) || posting ? S.submitOff : {}) }}
                    disabled={!currentCode || !nextWorkStatus(detailStatus) || posting}
                    onClick={() => advanceWorkStatus('detail')}>
                    {nextWorkStatus(detailStatus) ? `→ ${CONTENT_STATUS_LABEL[nextWorkStatus(detailStatus)!]}` : '승인 완료'}
                  </button>
                </div>
              </div>
              <button type="button" style={{ ...S.submitBtn, ...(!currentCode || posting ? S.submitOff : {}) }} disabled={!currentCode || posting} onClick={saveContentNote}>
                초안/메모 저장
              </button>
            </div>
          )}
          {isListingQueueRoom && (
            <div style={S.decisionBox}>
              <div style={S.decisionTitle}>등록대기</div>
              <div style={S.decisionHint}>draft 카드에서 「콘텐츠 작업 시작」을 누르면 콘텐츠 방으로 이동합니다.</div>
              {productSelect}
              <input style={{ ...S.input, marginTop: 8 }} value={titleDraft} onChange={(e) => setTitleDraft(e.target.value)} placeholder="상품명 초안 (선택)" />
            </div>
          )}
          <input style={{ ...S.input, width: 160, marginBottom: 8 }} value={authorName} onChange={(e) => setAuthorName(e.target.value)} placeholder="작성자" />
          <textarea style={S.textarea} value={content} onChange={(e) => setContent(e.target.value)}
            placeholder={isValidationRoom ? '검증 사유 (선택)' : isListingContentRoom ? '작업 메모 (선택)' : '메시지...'} />
          {!isValidationRoom && !isListingContentRoom && (
            <button style={{ ...S.submitBtn, ...(!content.trim() || posting ? S.submitOff : {}) }} disabled={!content.trim() || posting} onClick={submit}>
              {posting ? '저장 중...' : '방에 남기기'}
            </button>
          )}
          {errMsg && <div style={S.errMsg}>⚠ {errMsg}</div>}
          {okMsg && <div style={S.okMsg}>✅ {okMsg}</div>}
        </div>
      </main>
    </div>
  );
}
