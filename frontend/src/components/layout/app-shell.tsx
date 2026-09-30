'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { useAuth } from '../../context/auth-context';
import { LoginPage } from '../auth/login-page';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { apiKey } = useAuth();
  const isPlayground = pathname?.startsWith('/playground');

  if (!apiKey) {
    return <LoginPage />;
  }

  if (isPlayground) {
    return <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">{children}</div>;
  }

  return (
    <>
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-[var(--bg)] p-6 md:p-8">{children}</main>
      </div>
    </>
  );
}
