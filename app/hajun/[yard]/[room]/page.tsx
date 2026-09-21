'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import {
  HajunRoom, HajunMessage,
  MSG_TYPE_LABEL, MSG_TYPE_COLOR, MsgType, YARD_LABEL,
} from '@/types/hajun';

export default function RoomPage() {
  const params = useParams();
  const yardKey = params.yard as string;
  const roomKey = params.room as string;
  const [err, setErr] = useState('');
  const [room, setRoom] = useState<HajunRoom | null>(null);
  const [messages, setMessages] = useState<HajunMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const listRes = await fetch(`/api/hajun?action=room_list&yard=${yardKey}`);
      const listJson = await listRes.json();
      const rooms: HajunRoom[] = listJson.payload?.rooms || [];
      const found = rooms.find((r) => r.key === roomKey);
      if (!found) { setLoading(false); return; }
      setRoom(found);
      const viewRes = await fetch(`/api/hajun?action=view_room&room_id=${found.id}`);
      const viewJson = await viewRes.json();
      setMessages(viewJson.payload?.messages || []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
    setLoading(false);
  }, [yardKey, roomKey]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
        <Sidebar />
        <main style={{ flex: 1, padding: 24 }}><div style={{ color: 'var(--text3)' }}>로딩...</div></main>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: 24, maxWidth: 760 }}>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
          <Link href="/hajun" style={{ color: 'var(--text3)' }}>하준아이</Link>
          {' / '}{YARD_LABEL[yardKey] || yardKey}{' / '}{room?.name || roomKey}
        </div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 12 }}>{room?.name || roomKey}</div>
        <div style={{ fontSize: 12, color: 'var(--warn)', marginBottom: 16 }}>
          임시 복구 페이지입니다. 전체 warehouse UI는 곧 복구됩니다. (artifacts/room_page_sale_price.tsx)
        </div>
        {err && <div style={{ color: 'var(--warn)' }}>⚠ {err}</div>}
        {messages.length === 0 && <div style={{ color: 'var(--text3)' }}>메시지가 없습니다.</div>}
        {messages.map((m) => (
          <div key={m.id} style={{ marginBottom: 12, padding: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <div style={{ fontSize: 11, marginBottom: 6 }}>
              <span style={{ color: MSG_TYPE_COLOR[m.msg_type as MsgType] || '#888' }}>{MSG_TYPE_LABEL[m.msg_type as MsgType] || m.msg_type}</span>
              {' · '}{m.author_name}
            </div>
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.content}</div>
          </div>
        ))}
      </main>
    </div>
  );
}
