'use client';

import { useState } from 'react';

export default function CoreRingHandoffButton() {
  const [busy, setBusy] = useState(false);

  const openCoreRing = async () => {
    if (busy) return;
    const destinationBase = process.env.NEXT_PUBLIC_CORERING_URL;
    if (!destinationBase) {
      window.alert('CoreRing 주소가 설정되지 않았어요. (NEXT_PUBLIC_CORERING_URL)');
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/handoffs', {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ audience: 'corering' }),
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
            ? '공유 인증 세션이 없습니다. 먼저 인증된 Core에서 시작해 주세요.'
            : 'CoreHub 인증 전달에 실패했어요. 잠시 후 다시 시도해 주세요.',
        );
      }

      const destination = new URL('/auth/handoff', destinationBase);
      if (destination.protocol !== 'https:' && destination.hostname !== 'localhost') {
        throw new Error('CoreRing 주소는 HTTPS여야 합니다.');
      }
      destination.hash = new URLSearchParams({ ticket }).toString();
      window.location.assign(destination.toString());
    } catch (error: unknown) {
      window.alert(error instanceof Error ? error.message : 'CoreRing 연결에 실패했어요.');
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={openCoreRing}
      disabled={busy}
      title="CoreRing으로 인증 연결"
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
      <span style={{ fontSize: 16 }}>RING</span>
      {busy ? '연결 중…' : 'CoreRing'}
    </button>
  );
}
