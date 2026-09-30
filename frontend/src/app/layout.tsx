import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '../context/auth-context';
import { ToastProvider } from '../context/toast-context';
import { AppShell } from '../components/layout/app-shell';
import { ToastContainer } from '../components/ui/toast-container';

const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plex-sans',
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Axiomra Voice',
  description: 'Voice agents with documents, memory, and realtime chat',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${plexSans.variable} ${plexMono.variable} dark`}>
      <body className={`${plexSans.className} flex min-h-screen flex-col bg-[var(--bg)] text-[var(--text)] antialiased selection:bg-white/15`}>
        <ToastProvider>
          <AuthProvider>
            <AppShell>{children}</AppShell>
            <ToastContainer />
          </AuthProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
