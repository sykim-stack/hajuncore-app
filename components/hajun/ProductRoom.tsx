'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
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
  body: { flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: 760, minHeight: 0 },
  msgCard: { marginBottom: 16, padding: 14, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' },
  msgCardAi: { borderLeft: '3px solid #39C5CF' },
  msgTop: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  chip: { fontSize: 10, padding: '2px 8px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 },
  author: { fontSize: 12, fontWeight: 600 },
  time: { fontSize: 10, color: 'var(--text3)', marginLeft: 'auto', fontFamily: 'JetBrains Mono, monospace' },
  content: { fontSize: 13, lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' as const },
  // 콘텐츠 작업 폼이 길 때 잘리지 않도록 자체 스크롤. flexShrink:0 유지하되 maxHeight로 상한.
  compose: { borderTop: '1px solid var(--border)', background: 'var(--bg2)', padding: '14px 24px 18px', flexShrink: 0, maxHeight: '58vh', overflowY: 'auto' },
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
function parseImageUrls(text: string): string[] {
  return text.split(/\n+/).map((s) => s.trim()).filter((s) => /^https?:\/\//i.test(s));
}

type Cand = { id: string; content: string; metadata?: Record<string, unknown> | null };

export default function ProductRoom({ yardKey, roomKey }: { yardKey: string; roomKey: string }) {
  const isValidationRoom = yardKey === 'product_validation' && roomKey === 'product_validation';
  const isDiscoveryRoom = yardKey === 'product_validation' && roomKey === 'product_discovery';
  const isListingQueueRoom = yardKey === 'product_listing' && roomKey === 'listing_queue';
  const isListingContentRoom = yardKey === 'product_listing' && roomKey === 'listing_content';

  const [room, setRoom] = useState<HajunRoom | null>(null);
  const [messages, setMessages] = useState<HajunMessage[]>([]);
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
  const [salePrice, setSalePrice] = useState('');
  const [imageUrlsText, setImageUrlsText] = useState('');
  const [detailText, setDetailText] = useState('');
  const [channelCafe24, setChannelCafe24] = useState('');
  const [titleSuggestions, setTitleSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [thumbStatus, setThumbStatus] = useState<ContentWorkStatus>('pending');
  const [detailStatus, setDetailStatus] = useState<ContentWorkStatus>('pending');
  const [nameByCode, setNameByCode] = useState<Record<string, string>>({});
  const bottomRef = useRef<HTMLDivElement>(null);
  const currentCode = pickedCode;

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

  const selectForValidation = (message: HajunMessage) => {
    const code = typeof message.metadata?.internal_code === 'string' ? message.metadata.internal_code : '';
    if (!code) return;
    try {
      sessionStorage.setItem('hajun_validation_pick', JSON.stringify({ id: message.id, internal_code: code }));
    } catch { /* ignore */ }
    window.location.href = '/hajun/product_validation/product_validation';
  };

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
            title_draft: title || null,
            sale_price: salePrice.trim() ? Number(salePrice.replace(/[^0-9]/g, '')) || salePrice.trim() : null,
            image_urls: parseImageUrls(imageUrlsText),
            detail_text: detailText.trim() || null,
            thumbnail_status: thumbStatus, detail_status: detailStatus, target_malls: [],
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
            sale_price: salePrice.trim() ? Number(salePrice.replace(/[^0-9]/g, '')) || salePrice.trim() : null,
            image_urls: parseImageUrls(imageUrlsText),
            detail_text: detailText.trim() || null,
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
    const title = (titleDraft || (typeof message.metadata?.title_draft === 'string' ? message.metadata.title_draft : '') || '').trim();
    const priceRaw = salePrice.trim() || (message.metadata?.sale_price != null ? String(message.metadata.sale_price) : '');
    const priceNum = Number(String(priceRaw).replace(/[^0-9]/g, ''));
    const thumb = normalizeWorkStatus(message.metadata?.thumbnail_status ?? thumbStatus);
    const detail = normalizeWorkStatus(message.metadata?.detail_status ?? detailStatus);
    if (!title) { setErrMsg('게시 게이트: 상품명(title_draft)이 필요합니다.'); return; }
    if (!priceNum || priceNum <= 0) { setErrMsg('게시 게이트: 판매가(sale_price)가 필요합니다.'); return; }
    if (thumb !== 'approved') { setErrMsg('게시 게이트: 이미지(thumbnail)가 승인(approved)이어야 합니다.'); return; }
    const detailIncluded = detail === 'approved';
    setPosting(true); setErrMsg(''); setOkMsg('');
    try {
      const res = await fetch('/api/hajun?action=post_message', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          yard_key: 'product_listing', room_key: 'listing_published',
          author_type: 'human', author_name: authorName || '게시확인', msg_type: 'work_result',
          content: `쇼핑몰 게시 완료 확인: ${code} / ${title} / ${priceNum}원` + (detailIncluded ? ' (상세 포함)' : ' (상세 미포함)'),
          ref_ids: [message.id],
          metadata: {
            entity_type: 'listing_published',
            internal_code: code,
            status: 'published',
            title_draft: title,
            sale_price: priceNum,
            image_urls: parseImageUrls(imageUrlsText).length
              ? parseImageUrls(imageUrlsText)
              : (Array.isArray(message.metadata?.image_urls) ? message.metadata.image_urls : []),
            detail_text: detailText.trim()
              || (typeof message.metadata?.detail_text === 'string' ? message.metadata.detail_text : null),
            thumbnail_status: thumb,
            detail_status: detail,
            detail_included: detailIncluded,
            channel_ids: {
              ...(channelCafe24.trim() ? { cafe24: channelCafe24.trim() } : {}),
            },
            target_malls: channelCafe24.trim()
              ? ['cafe24']
              : (Array.isArray(message.metadata?.target_malls) ? message.metadata.target_malls : []),
            source_content_id: message.id,
            published_by: 'human',
            published_at: new Date().toISOString(),
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

  const productSelect = (
    <select style={S.select} value={pickedCandidateId} onChange={(e) => {
      const id = e.target.value; setPickedCandidateId(id);
      const c = candidates.find((x) => x.id === id);
      const code = typeof c?.metadata?.internal_code === 'string' ? c.metadata.internal_code : '';
      setPickedCode(code);
      const td = typeof c?.metadata?.title_draft === 'string' ? c.metadata.title_draft : '';
      if (td) setTitleDraft(td);
      const sp = c?.metadata?.sale_price;
      if (typeof sp === 'number' && sp > 0) setSalePrice(String(sp));
      else if (typeof sp === 'string' && sp.trim()) setSalePrice(sp.trim());
      const imgs = c?.metadata?.image_urls;
      if (Array.isArray(imgs) && imgs.length) setImageUrlsText(imgs.filter((u: unknown) => typeof u === 'string').join('\n'));
      const dt = c?.metadata?.detail_text;
      if (typeof dt === 'string' && dt.trim()) setDetailText(dt);
      // also restore from latest listing_content in room messages
      if (code) {
        for (let i = messages.length - 1; i >= 0; i--) {
          const mm = messages[i];
          if (mm.metadata?.entity_type !== 'listing_content') continue;
          if (mm.metadata?.internal_code !== code) continue;
          setThumbStatus(normalizeWorkStatus(mm.metadata?.thumbnail_status));
          setDetailStatus(normalizeWorkStatus(mm.metadata?.detail_status));
          const t2 = mm.metadata?.title_draft;
          if (typeof t2 === 'string' && t2.trim()) setTitleDraft(t2);
          const sp2 = mm.metadata?.sale_price;
          if (typeof sp2 === 'number' && sp2 > 0) setSalePrice(String(sp2));
          else if (typeof sp2 === 'string' && sp2.trim()) setSalePrice(sp2.trim());
          const imgs2 = mm.metadata?.image_urls;
          if (Array.isArray(imgs2) && imgs2.length) setImageUrlsText(imgs2.filter((u: unknown) => typeof u === 'string').join('\n'));
          const dt2 = mm.metadata?.detail_text;
          if (typeof dt2 === 'string' && dt2.trim()) setDetailText(dt2);
          break;
        }
      }
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
                  <span style={{ ...S.chip, background: `${MSG_TYPE_COLOR[m.msg_type as MsgType] || '#484F58'}22`, color: MSG_TYPE_COLOR[m.msg_type as MsgType] || '#8B949E' }}>
                    {MSG_TYPE_LABEL[m.msg_type as MsgType] || m.msg_type}
                  </span>
                  <span style={S.author}>{m.author_name}</span>
                  {code && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{displayCode(code)}</span>}
                  <span style={S.time}>{fmtTime(m.created_at)}</span>
                </div>
                <div style={S.content}>{m.content}</div>
                <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {isDiscoveryRoom && entity === 'product_candidate' && (
                    <button type="button" style={{ ...S.submitBtn, background: '#3FB950' }} onClick={() => selectForValidation(m)}>검증 선택</button>
                  )}
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
              <input style={{ ...S.input, marginBottom: 8, width: 180 }} value={salePrice} onChange={(e) => setSalePrice(e.target.value.replace(/[^0-9]/g, ''))} placeholder="판매가 (원)" inputMode="numeric" />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>이미지 URL (한 줄에 하나, https://…) — 바이너리 첨부 금지</div>
              <textarea style={{ ...S.textarea, minHeight: 56, marginBottom: 8 }} value={imageUrlsText} onChange={(e) => setImageUrlsText(e.target.value)} placeholder={"https://example.com/thumb.jpg\nhttps://example.com/detail1.jpg"} />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>상세 본문 (detail_text)</div>
              <textarea style={{ ...S.textarea, minHeight: 90, marginBottom: 8 }} value={detailText} onChange={(e) => setDetailText(e.target.value)} placeholder="판매용 상세 설명 (원문 복제 금지, 재구성)" />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>채널 상품번호 (게시 시 channel_ids)</div>
              <input style={{ ...S.input, marginBottom: 8, width: 220 }} value={channelCafe24} onChange={(e) => setChannelCafe24(e.target.value.trim())} placeholder="cafe24 product_no (선택)" />
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>1차 게시 게이트: 상품명 + 판매가 + 이미지 승인 + 사람 게시</div>
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
              <input style={{ ...S.input, marginTop: 8, width: 180 }} value={salePrice} onChange={(e) => setSalePrice(e.target.value.replace(/[^0-9]/g, ''))} placeholder="판매가 (원, 선택)" inputMode="numeric" />
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
