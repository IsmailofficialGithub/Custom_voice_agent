'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { apiClient } from '../../lib/api-client';
import companyConfig from '../../config/company.json';
import { Activity, Sun, Moon, Menu, ShieldCheck } from 'lucide-react';
import { TwoFactorModal } from '../auth/two-factor-modal';

interface HeaderProps {
  onToggleMenu?: () => void;
}

export function Header({ onToggleMenu }: HeaderProps) {
  const { currentUser, apiKey } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [healthStatus, setHealthStatus] = useState<'connected' | 'error' | 'checking'>('checking');
  const [show2FAModal, setShow2FAModal] = useState(false);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 20000);
    return () => clearInterval(interval);
  }, [apiKey]);

  const checkHealth = async () => {
    try {
      const res = await apiClient.getHealth(apiKey);
      setHealthStatus(res.status === 'ok' ? 'connected' : 'error');
    } catch {
      setHealthStatus('error');
    }
  };

  return (
    <header className="sticky top-0 z-30 flex w-full items-center justify-between border-b border-[var(--border)] bg-[var(--panel)] px-3 sm:px-5 py-2.5 sm:py-3">
      <div className="flex items-center gap-2.5 sm:gap-3">
        {onToggleMenu && (
          <button
            type="button"
            onClick={onToggleMenu}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] hover:text-[var(--text)] md:hidden"
            aria-label="Toggle navigation menu"
          >
            <Menu className="h-4 w-4" />
          </button>
        )}
        <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1.5 shadow-sm shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt={companyConfig.name} className="h-full w-full object-contain" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-[var(--text)]">{companyConfig.name}</h1>
            <span className="font-mono text-[10px] text-[var(--text-faint)] hidden xs:inline">{companyConfig.version}</span>
          </div>
          <p className="text-xs text-[var(--text-muted)] hidden sm:block">{companyConfig.tagline}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          onClick={checkHealth}
          className="hidden items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--border-strong)] sm:inline-flex"
          title="Backend connection status"
        >
          <Activity
            className={`h-3.5 w-3.5 ${healthStatus === 'connected' ? 'text-[var(--ok)]' : healthStatus === 'checking' ? 'text-[var(--text-faint)]' : 'text-[var(--danger)]'}`}
          />
          <span>{healthStatus === 'connected' ? 'Online' : healthStatus === 'checking' ? 'Checking' : 'Offline'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShow2FAModal(true)}
          className="ui-btn ui-btn-ghost flex items-center gap-1.5"
          title="Configure Two-Factor Authentication"
        >
          <ShieldCheck className={`h-3.5 w-3.5 ${currentUser.isTwoFactorEnabled ? 'text-[var(--ok)]' : 'text-[var(--text-muted)]'}`} />
          <span className="hidden sm:inline">2FA</span>
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          className="ui-btn ui-btn-ghost px-2.5"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-3.5 w-3.5 text-amber-400" />
          ) : (
            <Moon className="h-3.5 w-3.5 text-indigo-500" />
          )}
        </button>
      </div>

      <TwoFactorModal isOpen={show2FAModal} onClose={() => setShow2FAModal(false)} />
    </header>
  );
}
