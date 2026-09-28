'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { Header } from './header';
import { Sidebar } from './sidebar';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isPlayground = pathname?.startsWith('/playground');

  if (isPlayground) {
    return <div className="min-h-screen bg-black text-white">{children}</div>;
  }

  return (
    <>
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-y-auto bg-gradient-to-br from-[#090d16] via-[#0f172a] to-[#090d16] p-6 md:p-8">
          {children}
        </main>
      </div>
    </>
  );
}
