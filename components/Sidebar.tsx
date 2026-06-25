'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/dashboard', icon: '🎯', label: '대시보드' },
  { href: '/health',    icon: '🩺', label: '헬스' },
  { href: '/snapshots', icon: '📸', label: '스냅샷' },
  { href: '/chat',      icon: '🧠', label: 'HajunAI' },
];

export default function Sidebar() {
  const path = usePathname();
  return (
    <aside style={{
      width: 220, minHeight: '100vh', background: 'var(--bg2)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', padding: '20px 0',
    }}>
      {/* 로고 */}
      <div style={{ padding: '0 20px 24px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36,
            background: 'linear-gradient(135deg,#58A6FF,#3FB950)',
            borderRadius: 8, display: 'flex', alignItems: 'center',
            justifyContent: 'center', fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 700, fontSize: 13, color: '#0D1117',
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
            <Link key={href} href={href} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 'var(--radius)',
              textDecoration: 'none', fontSize: 13, fontWeight: active ? 600 : 400,
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
        v1.0 · 기억보다 행동
      </div>
    </aside>
  );
}