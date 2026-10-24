'use client';

import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Header } from './header';
import { Sidebar } from './sidebar';
import { useAuth } from '../../context/auth-context';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { apiKey, ready } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isPlayground = pathname?.startsWith('/playground');
  const isLoginRoute = pathname === '/login';

  useEffect(() => {
    if (!ready) return;
    if (!apiKey && !isLoginRoute) {
      router.replace('/login');
    } else if (apiKey && isLoginRoute) {
      router.replace('/');
    }
  }, [ready, apiKey, isLoginRoute, router]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] text-sm text-[var(--text-muted)]">
        Loading…
      </div>
    );
  }

  if (isLoginRoute) {
    return <>{children}</>;
  }

  if (!apiKey) {
    return null;
  }

  if (isPlayground) {
    return <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">{children}</div>;
  }

  return (
    <>
      <Header onToggleMenu={() => setMobileMenuOpen(!mobileMenuOpen)} />
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar isOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
        <main className="flex-1 overflow-y-auto bg-[var(--bg)] p-4 sm:p-6 md:p-8">{children}</main>
      </div>
    </>
  );
}
