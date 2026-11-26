'use client';
import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  HajunYard, HajunRoomWithLatest, MSG_TYPE_LABEL, MSG_TYPE_COLOR, MsgType,
  YardTab, TAB_YARD_KEYS, TAB_LABEL, YARD_LABEL,
} from '@/types/hajun';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

type WorkspaceTab = 'original' | YardTab;
type SourceItem = {
  id: string;
  room_id: string;
  content: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
  room?: { key?: string; name?: string } | null;
  yard?: { key?: string; name?: string } | null;
};

const S: Record<string, React.CSSProperties> = {
  page:   { display: 'flex', minHeight: '100vh', background: 'var(--bg)' },
  main:   { flex: 1, padding: 'var(--page-py) var(--page-px)', overflowY: 'auto', minWidth: 0 },
  title:  { fontSize: 22, fontWeight: 700, marginBottom: 4 },
  sub:    { fontSize: 12, color: 'var(--text2)', marginBottom: 16, fontFamily: 'JetBrains Mono, monospace' },
  tabs:   { display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' as const },
  tab:    { padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'Noto Sans KR, sans-serif' },
  tabOn:  { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'rgba(88,166,255,0.1)' },
  hint:   { fontSize: 12, color: 'var(--text3)', marginBottom: 16, lineHeight: 1.5 },
  yardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20, alignItems: 'start' },
  yardCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' },
  yardHead: { padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'var(--text)' },
  yardName: { fontSize: 16, fontWeight: 700 },
  yardArrow:{ fontSize: 13, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' },
  roomRow:  { display: 'block', padding: '12px 18px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'var(--text)' },
  roomTop:  { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  roomName: { fontSize: 13, fontWeight: 600 },
  chip:     { fontSize: 10, padding: '2px 7px', borderRadius: 4, fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 },
  snippet:  { fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  empty:    { fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' },
  sourcePanel: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 20 },
  sourcePanelTitle: { fontSize: 14, fontWeight: 700, marginBottom: 10 },
  sourcePanelHint: { fontSize: 11, color: 'var(--text3)', marginBottom: 12, lineHeight: 1.5 },
  sourceControls: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: 8 },
  sourceInput: { width: '100%', minWidth: 0, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '9px 11px', fontSize: 12, outline: 'none', fontFamily: 'Noto Sans KR, sans-serif' },
  sourceTextarea: { width: '100%', minHeight: 110, resize: 'vertical' as const, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', padding: '10px 12px', fontSize: 13, lineHeight: 1.6, outline: 'none', fontFamily: 'Noto Sans KR, sans-serif' },
  sourceButton: { padding: '9px 16px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: '#0D1117', fontWeight: 700, fontSize: 12, cursor: 'pointer' },
  sourceListTitle: { fontSize: 14, fontWeight: 700, marginBottom: 10 },
  sourceCard: { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 14, marginBottom: 10 },
  sourceMeta: { display: 'flex', gap: 8, flexWrap: 'wrap' as const, fontSize: 10, color: 'var(--text3)', marginBottom: 8 },
  sourceContent: { fontSize: 12, color: 'var(--text2)', lineHeight: 1.65, whiteSpace: 'pre-wrap' as const, overflowWrap: 'anywhere' as const },
};

function chip(type: MsgType) {
  const color = MSG_TYPE_COLOR[type];
  return (
    <span style={{ ...S.chip, background: `${color}22`, color }}>
      {MSG_TYPE_LABEL[type]}
    </span>
  );
}

function YardCard({
  yard,
  rooms,
}: {
  yard: HajunYard;
  rooms: HajunRoomWithLatest[];
}) {
  return (
    <div style={S.yardCard}>
      <Link href={`/hajun/${yard.key}`} style={S.yardHead}>
        <span style={S.yardName}>{yard.name || YARD_LABEL[yard.key] || yard.key}</span>
        <span style={S.yardArrow}>거실 보기 →</span>
      </Link>
      {rooms.length === 0 && (
        <div style={{ padding: '12px 18px' }}>
          <div style={S.empty}>방 없음</div>
        </div>
      )}
      {rooms.map((room) => (
        <Link key={room.id} href={`/hajun/${yard.key}/${room.key}`} style={S.roomRow}>
          <div style={S.roomTop}>
            <span style={S.roomName}>{room.name}</span>
            {room.latest && chip(room.latest.msg_type)}
          </div>
          {room.latest
            ? <div style={S.snippet}>{room.latest.author_name} · {room.latest.content}</div>
            : <div style={S.empty}>아직 메시지 없음</div>}
        </Link>
      ))}
    </div>
  );
}

export default function HajunHome() {
  const [yards, setYards]     = useState<HajunYard[]>([]);
  const [byYard, setByYard]   = useState<Record<string, HajunRoomWithLatest[]>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<WorkspaceTab>('brainpool');
  const [sourceItems, setSourceItems] = useState<SourceItem[]>([]);
  const [sourceLoading, setSourceLoading] = useState(false);
  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceContent, setSourceContent] = useState('');
  const [selectedYardKey, setSelectedYardKey] = useState('brainpool');
  const [selectedRoomId, setSelectedRoomId] = useState('');
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const [sourceMessage, setSourceMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const yardRes = await fetch('/api/hajun?action=yard_list');
    const yardJson = await yardRes.json();
    const yardList: HajunYard[] = yardJson.payload || [];
    setYards(yardList);

    const entries = await Promise.all(
      yardList.map(async (y) => {
        const res = await fetch(`/api/hajun?action=view_yard&yard=${y.key}`);
        const json = await res.json();
        return [y.key, json.payload?.rooms || []] as const;
      })
    );
    setByYard(Object.fromEntries(entries));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadSources = useCallback(async () => {
    setSourceLoading(true);
    setSourceError('');
    setSourceItems([]);
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error('인증 설정을 확인해 주세요.');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Google 로그인 후 원본을 조회할 수 있습니다.');

      const res = await fetch(`/api/source/list?scope=${tab}`, {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const json = await res.json();
      if (!res.ok || json._error) throw new Error(json._error || '원본 조회에 실패했습니다.');
      setSourceItems(json.payload?.items || []);
    } catch (error) {
      setSourceItems([]);
      setSourceError(error instanceof Error ? error.message : String(error));
    } finally {
      setSourceLoading(false);
    }
  }, [tab]);

  useEffect(() => { loadSources(); }, [loadSources]);

  const yardByKey = useMemo(() => {
    const m = new Map<string, HajunYard>();
    for (const y of yards) m.set(y.key, y);
    return m;
  }, [yards]);

  const visibleKeys = tab === 'original' ? [] : TAB_YARD_KEYS[tab];
  const allowedYardKeys = tab === 'original' ? yards.map((yard) => yard.key) : [...TAB_YARD_KEYS[tab]];
  const availableYards = yards.filter((yard) => allowedYardKeys.includes(yard.key));
  const targetRooms = byYard[selectedYardKey] || [];

  useEffect(() => {
    if (allowedYardKeys.length > 0 && !allowedYardKeys.includes(selectedYardKey)) {
      setSelectedYardKey(allowedYardKeys[0]);
    }
  }, [allowedYardKeys.join('|'), selectedYardKey]);

  useEffect(() => {
    if (!targetRooms.some((room) => room.id === selectedRoomId)) {
      setSelectedRoomId(targetRooms[0]?.id || '');
    }
  }, [targetRooms, selectedRoomId]);

  const submitSource = async () => {
    if (!selectedRoomId || !sourceContent.trim() || sourceBusy) return;
    setSourceBusy(true);
    setSourceError('');
    setSourceMessage('');
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) throw new Error('인증 설정을 확인해 주세요.');
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Google 로그인 후 원본을 저장할 수 있습니다.');

      const res = await fetch('/api/source/upload', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          room_id: selectedRoomId,
          title: sourceTitle.trim(),
          content: sourceContent,
          content_type: 'text/markdown',
        }),
      });
      const json = await res.json();
      if (!res.ok || json._error) throw new Error(json._error || '원본 저장에 실패했습니다.');

      setSourceTitle('');
      setSourceContent('');
      setSourceMessage('원본 저장 완료 · 동일한 Source를 탭별 View로 표시합니다.');
      await loadSources();
    } catch (error) {
      setSourceError(error instanceof Error ? error.message : String(error));
    } finally {
      setSourceBusy(false);
    }
  };

  return (
    <div style={S.page}>
      <Sidebar />
      <main style={S.main}>
        <div className="mobile-header-space" />
        <div style={S.title}>🏠 하준아이</div>
        <div style={S.sub}>마당 · 거실 · 방 — 메시지는 오직 방에만 산다. 나머지는 전부 뷰다.</div>

        <div style={S.tabs}>
          {(['original', 'brainpool', 'warehouse'] as WorkspaceTab[]).map((t) => (
            <button
              key={t}
              type="button"
              style={{ ...S.tab, ...(tab === t ? S.tabOn : {}) }}
              onClick={() => setTab(t)}
            >
              {t === 'original' ? '원본' : TAB_LABEL[t]}
            </button>
          ))}
        </div>

        {tab === 'original' && (
          <div style={S.hint}>원본 기록. 입력한 Source는 한 번만 저장되고, 다른 탭에서는 같은 원본을 맥락에 따라 조회합니다.</div>
        )}
        {tab === 'brainpool' && (
          <div style={S.hint}>본류 · 결정 · 현재 흐름. 관제 · 개발 · 브라이언풀 마당입니다.</div>
        )}
        {tab === 'warehouse' && (
          <div style={S.hint}>상품 검증·등록 작업 공간. 두 마당은 특성이 달라 합치지 않고 따로 둡니다.</div>
        )}

        <section style={S.sourcePanel}>
          <div style={S.sourcePanelTitle}>✍️ 작업 원본 입력</div>
          <div style={S.sourcePanelHint}>저장 위치를 방 단위로 지정합니다. 저장은 한 번만 하며, 원본 탭과 해당 영역 탭은 같은 메시지를 View로 읽습니다.</div>
          <div style={S.sourceControls}>
            <select
              style={S.sourceInput}
              value={selectedYardKey}
              onChange={(event) => setSelectedYardKey(event.target.value)}
            >
              {availableYards.map((yard) => (
                <option key={yard.id} value={yard.key}>{yard.name || YARD_LABEL[yard.key] || yard.key}</option>
              ))}
            </select>
            <select
              style={S.sourceInput}
              value={selectedRoomId}
              onChange={(event) => setSelectedRoomId(event.target.value)}
              disabled={targetRooms.length === 0}
            >
              {targetRooms.map((room) => (
                <option key={room.id} value={room.id}>{room.name}</option>
              ))}
            </select>
            <input
              style={S.sourceInput}
              value={sourceTitle}
              onChange={(event) => setSourceTitle(event.target.value)}
              placeholder="작업 제목 (선택)"
              maxLength={200}
            />
          </div>
          <textarea
            style={S.sourceTextarea}
            value={sourceContent}
            onChange={(event) => setSourceContent(event.target.value)}
            placeholder="작업 내용을 원본 그대로 입력해 주세요..."
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
            <button
              type="button"
              style={{ ...S.sourceButton, opacity: !selectedRoomId || !sourceContent.trim() || sourceBusy ? 0.55 : 1 }}
              disabled={!selectedRoomId || !sourceContent.trim() || sourceBusy}
              onClick={submitSource}
            >
              {sourceBusy ? '저장 중...' : '원본 저장'}
            </button>
            {sourceMessage && <span style={{ fontSize: 11, color: 'var(--accent2)' }}>{sourceMessage}</span>}
            {sourceError && <span style={{ fontSize: 11, color: 'var(--warn)' }}>{sourceError}</span>}
          </div>
        </section>

        <div style={S.sourceListTitle}>📄 원본 View · {sourceItems.length}건</div>
        {sourceLoading && <div style={{ color: 'var(--text2)', fontSize: 12, marginBottom: 12 }}>원본 불러오는 중...</div>}
        {!sourceLoading && sourceError && <div style={{ color: 'var(--warn)', fontSize: 12, marginBottom: 12 }}>{sourceError}</div>}
        {!sourceLoading && !sourceError && sourceItems.length === 0 && (
          <div style={{ ...S.sourceCard, ...S.empty }}>아직 등록된 원본이 없습니다.</div>
        )}
        {sourceItems.map((item) => {
          const metadata = item.metadata || {};
          const title = typeof metadata.title === 'string' && metadata.title.trim()
            ? metadata.title
            : '제목 없는 원본';
          return (
            <article key={item.id} style={S.sourceCard}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 7 }}>{title}</div>
              <div style={S.sourceMeta}>
                <span>{item.yard?.name || YARD_LABEL[item.yard?.key || ''] || item.yard?.key || '마당'}</span>
                <span>·</span>
                <span>{item.room?.name || item.room?.key || '방'}</span>
                <span>·</span>
                <span>{item.created_at ? new Date(item.created_at).toLocaleString('ko-KR') : ''}</span>
              </div>
              <div style={S.sourceContent}>{item.content}</div>
            </article>
          );
        })}

        {loading && <div style={{ color: 'var(--text2)', fontSize: 13 }}>⏳ 마당 불러오는 중...</div>}

        {!loading && tab !== 'original' && (
          <div style={S.yardGrid} className="yard-grid">
            {visibleKeys.map((key) => {
              const yard = yardByKey.get(key);
              if (!yard) {
                return (
                  <div key={key} style={S.yardCard}>
                    <div style={{ ...S.yardHead, cursor: 'default' }}>
                      <span style={S.yardName}>{YARD_LABEL[key] || key}</span>
                    </div>
                    <div style={{ padding: '12px 18px' }}>
                      <div style={S.empty}>마당 데이터 없음</div>
                    </div>
                  </div>
                );
              }
              const rooms = byYard[key] || [];
              return <YardCard key={key} yard={yard} rooms={rooms} />;
            })}
          </div>
        )}
      </main>

      <style>{`
        .mobile-header-space { height: 0; }
        @media (max-width: 900px) {
          .yard-grid { grid-template-columns: 1fr !important; }
        }
        @media (max-width: 768px) {
          .mobile-header-space { height: 48px !important; }
        }
      `}</style>
    </div>
  );
}
