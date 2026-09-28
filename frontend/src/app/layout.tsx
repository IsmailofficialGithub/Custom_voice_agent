import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../context/auth-context';
import { ToastProvider } from '../context/toast-context';
import { AppShell } from '../components/layout/app-shell';
import { ToastContainer } from '../components/ui/toast-container';

export const metadata: Metadata = {
  title: 'Axirom Voice Agent Studio',
  description: 'Enterprise Autonomous Voice Agent Platform with pgvector RAG and WebSocket Streaming',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="flex min-h-screen flex-col bg-[#090d16] text-slate-100 antialiased selection:bg-white/20 selection:text-white">
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
