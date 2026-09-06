import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HajunCore App — BRAINPOOL OS',
  // [CoreNull UI 정리 2026-09-06] 앱의 현재 3축: 상태·대화·기억.
  description: '상태 대시보드 / 하준챗 / 기억 관리 허브',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
