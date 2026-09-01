'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

const NAV = [
  { href: '/hajun',     icon: '🏠', label: '하준아이' },
  { href: '/dashboard', icon: '🎯', label: '대시보드' },
  { href: '/health',    icon: '🩺', label: '헬스' },
  { href: '/snapshots', icon: '📸', label: '스냅샷' },
  { href: '/chat',      icon: '💬', label: '하준챗' },
];

export default function Sidebar() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

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
              fontWeight: 700, fontSize: 13, color: '#0D1117', flexShrink: 0,
            }}>BP</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>HajunCore</div>
              <div style={{ fontSize: 10, color: 'var(--text2)', fontFamily: 'JetBrains Mono, monospace' }}>BRAINPOOL OS</div>
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
                  textDecoration: 'none', fontSize: 13,
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
        </nav>

        <div style={{ padding: '16px 20px', fontSize: 10, color: 'var(--text3)', fontFamily: 'JetBrains Mono, monospace' }}>
          v2.0 · 방은 고정, 참여자는 유동
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
            z-index: 95 !important;
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