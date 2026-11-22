'use client';

import { useState } from 'react';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';

export default function CoreNullHandoffButton() {
  const [busy, setBusy] = useState(false);

  const openCoreNull = async () => {
    if (busy) return;
    const destinationBase = process.env.NEXT_PUBLIC_CORENULL_URL;
    if (!destinationBase) {
      window.alert('CoreNull 주소가 설정되지 않았어요. (NEXT_PUBLIC_CORENULL_URL)');
      return;
    }

    setBusy(true);
    try {
      const supabase = getSupabaseBrowser();
      if (!supabase) {
        throw new Error('인증 설정이 없습니다. (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)');
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        throw new Error('공유 인증 세션이 없습니다. 먼저 로그인해 주세요.');
      }

      const response = await fetch('/api/auth/handoffs', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        credentials: 'include',
        body: JSON.stringify({ audience: 'corenull' }),
      });
      const result = await response.json().catch(() => null);
      const ticket = result?.data?.ticket;

      if (
        !response.ok ||
        typeof ticket !== 'string' ||
        !/^[A-Za-z0-9_-]{43}$/.test(ticket)
      ) {
        throw new Error(
          result?._error === 'auth_required'
            ? '공유 인증 세션이 없습니다. 먼저 로그인해 주세요.'
            : 'CoreHub 인증 전달에 실패했어요. 잠시 후 다시 시도해 주세요.',
        );
      }

      const destination = new URL('/auth/handoff', destinationBase);
      if (destination.protocol !== 'https:' && destination.hostname !== 'localhost') {
        throw new Error('CoreNull 주소는 HTTPS여야 합니다.');
      }
      destination.hash = new URLSearchParams({ ticket }).toString();
      window.location.assign(destination.toString());
    } catch (error: unknown) {
      window.alert(error instanceof Error ? error.message : 'CoreNull 연결에 실패했어요.');
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={openCoreNull}
      disabled={busy}
      title="CoreNull로 인증 연결"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        padding: '10px 12px',
        borderRadius: 'var(--radius)',
        border: 'none',
        background: 'transparent',
        color: 'var(--text2)',
        fontSize: 16,
        cursor: busy ? 'wait' : 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: 16 }}>NULL</span>
      {busy ? '연결 중…' : 'CoreNull'}
    </button>
  );
}
