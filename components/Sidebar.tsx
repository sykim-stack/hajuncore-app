'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import CoreNullHandoffButton from '@/components/CoreNullHandoffButton';
import CoreRingHandoffButton from '@/components/CoreRingHandoffButton';
import { getSupabaseBrowser } from '@/lib/supabaseBrowser';
import type { Session } from '@supabase/supabase-js';

// [CoreNull UI 정리 2026-09-06]
// 운영 화면은 상태(대시보드)·대화(하준챗)·축적된 결과(기억)의 3축으로 유지한다.
// 헬스는 대시보드에 흡수하고, 스냅샷은 실제 데이터 성격에 맞춰 기억으로 부른다.
const NAV = [
  { href: '/dashboard', icon: '🎯', label: '대시보드' },
  { href: '/chat',      icon: '💬', label: '하준챗' },
  { href: '/snapshots', icon: '🧠', label: '기억' },
  // [CoreNull UI 정리 2026-09-06] 마당은 자동 피드가 아니라 명시적 방문 공간이다.
  { href: '/hajun',     icon: '🏡', label: '하준아이 마당' },
];

const REOPEN_SIDEBAR_AFTER_LOGIN_KEY = 'hajun_reopen_sidebar_after_login';

export default function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const showCoreNull = Boolean(process.env.NEXT_PUBLIC_CORENULL_URL);
  const showCoreRing = Boolean(process.env.NEXT_PUBLIC_CORERING_URL);
  const [email, setEmail] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;

    const applySession = (session: Session | null) => {
      setEmail(session?.user?.email ?? null);
      if (
        session &&
        window.sessionStorage.getItem(REOPEN_SIDEBAR_AFTER_LOGIN_KEY) === '1'
      ) {
        window.sessionStorage.removeItem(REOPEN_SIDEBAR_AFTER_LOGIN_KEY);
        setOpen(true);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInGoogle = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) {
      window.alert('인증 설정이 없습니다. (NEXT_PUBLIC_SUPABASE_URL / ANON_KEY)');
      return;
    }
    if (window.matchMedia('(max-width: 768px)').matches) {
      window.sessionStorage.setItem(REOPEN_SIDEBAR_AFTER_LOGIN_KEY, '1');
    } else {
      window.sessionStorage.removeItem(REOPEN_SIDEBAR_AFTER_LOGIN_KEY);
    }
    setAuthBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: typeof window !== 'undefined' ? window.location.origin + path : undefined,
        },
      });
      if (error) throw error;
    } catch (e: unknown) {
      window.sessionStorage.removeItem(REOPEN_SIDEBAR_AFTER_LOGIN_KEY);
      window.alert(e instanceof Error ? e.message : '로그인에 실패했어요.');
      setAuthBusy(false);
    }
  };

  const signOut = async () => {
    const supabase = getSupabaseBrowser();
    if (!supabase) return;
    setAuthBusy(true);
    try {
      await supabase.auth.signOut();
      setEmail(null);
    } finally {
      setAuthBusy(false);
    }
  };

  return (
    <>
      {/* 모바일 햄버거 버튼 */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'none',
          position: 'fixed', top: 12, left: 12, zIndex: 100,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 6, padding: '6px 10px',
          color: 'var(--text)', cursor: 'pointer', fontSize: 16,
        }}
        className="mobile-menu-btn"
        aria-label="메뉴"
      >
        {open ? '✕' : '☰'}
      </button>

      {/* 모바일 오버레이 */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            display: 'none',
            position: 'fixed', inset: 0, zIndex: 90,
            background: 'rgba(0,0,0,0.5)',
          }}
          className="mobile-overlay"
        />
      )}

      {/* 사이드바 */}
      <aside
        style={{
          width: 220, minHeight: '100vh',
          background: 'var(--bg2)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          padding: '20px 0',
          flexShrink: 0,
        }}
        className={`sidebar ${open ? 'sidebar-open' : ''}`}
      >
        {/* 로고 */}
        <div style={{ padding: '0 20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36,
              background: 'linear-gradient(135deg,#58A6FF,#3FB950)',
              borderRadius: 8, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 700, fontSize: 14, color: '#0D1117', flexShrink: 0,
            }}>BP</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>HajunCore</div>
              <div style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'Noto Sans KR, sans-serif' }}>BRAINPOOL OS</div>
            </div>
          </div>
        </div>

        {/* 네비 */}
        <nav style={{ flex: 1, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {NAV.map(({ href, icon, label }) => {
            const active = path === href || path.startsWith(href + '/');
            return (
              <Link key={href} href={href}
                onClick={() => setOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 'var(--radius)',
                  textDecoration: 'none', fontSize: 16,
                  fontWeight: active ? 600 : 400,
                  color: active ? 'var(--accent)' : 'var(--text2)',
                  background: active ? 'rgba(88,166,255,0.1)' : 'transparent',
                  transition: 'all 0.15s',
                }}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                {label}
              </Link>
            );
          })}

          {(showCoreNull || showCoreRing) && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
              <div style={{ padding: '4px 12px 8px', fontSize: 12, color: 'var(--text2)' }}>
                Core 연결
              </div>
              {showCoreNull && <CoreNullHandoffButton />}
              {showCoreRing && <CoreRingHandoffButton />}
            </div>
          )}
        </nav>

        {/* Path S: 최소 로그인 */}
        <div style={{
          padding: '12px 16px',
          borderTop: '1px solid var(--border)',
          fontSize: 13,
          color: 'var(--text2)',
          fontFamily: 'Noto Sans KR, sans-serif',
        }}>
          {email ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={email}>
                {email}
              </div>
              <button
                type="button"
                onClick={signOut}
                disabled={authBusy}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text2)',
                  cursor: authBusy ? 'wait' : 'pointer',
                  fontSize: 13,
                }}
              >
                로그아웃
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={signInGoogle}
              disabled={authBusy}
              style={{
                width: '100%',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border)',
                background: 'rgba(88,166,255,0.1)',
                color: 'var(--accent)',
                cursor: authBusy ? 'wait' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              {authBusy ? '이동 중…' : 'Google 로그인'}
            </button>
          )}
          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7 }}>
            v1.1 · 기억보다 행동
          </div>
        </div>
      </aside>

      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-btn { display: block !important; }
          .mobile-overlay  { display: block !important; }
          .sidebar {
            position: fixed !important;
            left: -220px !important;
            top: 0 !important;
            zIndex: 95 !important;
            transition: left 0.25s ease !important;
            min-height: 100dvh !important;
          }
          .sidebar.sidebar-open {
            left: 0 !important;
          }
        }
      `}</style>
    </>
  );
}
