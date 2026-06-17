import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HajunCore App — BRAINPOOL OS',
  description: '맥락 관리 / 스냅샷 / 프롬프트 생성 허브',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
