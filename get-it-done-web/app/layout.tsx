import type { Metadata, Viewport } from 'next';
import { DM_Sans } from 'next/font/google';
import './globals.css';
import { QuickAddBar } from '@/components/QuickAddBar';

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-dm-sans',
});

export const metadata: Metadata = {
  title: 'Get-it-done — Plan your day. Track reality.',
  description:
    'The honest focus app: plan your time, track what really happens, and see the gap. Kanban, Schedule, Timeline, and timer in one.',
  manifest: '/manifest.webmanifest',
  icons: { icon: '/icon.svg', apple: '/icon.svg' },
  appleWebApp: { capable: true, title: 'Get-it-done', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#8b5cf6',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${dmSans.variable} h-full`}>
      <body className="min-h-full antialiased">
        {children}
        {/* Phase 6 polish — global Quick-add Ctrl+K bar. The component
            self-guards on userId so it's a true no-op on /login and
            /auth/callback where no user is set. */}
        <QuickAddBar />
      </body>
    </html>
  );
}
