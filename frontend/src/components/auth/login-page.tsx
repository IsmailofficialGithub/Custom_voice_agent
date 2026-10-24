'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import companyConfig from '../../config/company.json';
import { Mail, Lock, ArrowRight, ShieldCheck, Sun, Moon } from 'lucide-react';

export function LoginPage() {
  const router = useRouter();
  const { login, apiKey, currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      const res = await login(email, password, requiresTwoFactor ? twoFactorCode : undefined);
      if (res.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setError('');
        return;
      }
      if (res.success) {
        router.push('/');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid email or password');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-12 transition-colors duration-200">
      {/* Top right theme toggle */}
      <div className="absolute top-5 right-5 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] shadow-xs"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? (
            <Sun className="h-4 w-4 text-amber-400" />
          ) : (
            <Moon className="h-4 w-4 text-indigo-500" />
          )}
        </button>
      </div>

      <div className="w-full max-w-sm space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2.5">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={companyConfig.name} className="h-full w-full object-contain" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
              Sign in to {companyConfig.name}
            </h1>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Enter your credentials to access your workspace
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-sm space-y-5 transition-colors duration-200">
          {/* If already authenticated notice */}
          {apiKey && (
            <div className="rounded-lg border border-[var(--ok)]/30 bg-[var(--ok)]/10 p-3 text-xs text-[var(--text)] space-y-2">
              <div className="flex items-center gap-2 font-medium text-[var(--ok)]">
                <ShieldCheck className="h-4 w-4" />
                <span>Signed in as {currentUser.email || currentUser.name}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="font-semibold text-[var(--accent)] underline hover:opacity-80"
                >
                  Go to Dashboard →
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="text-xs text-[var(--danger)] hover:underline"
                >
                  Sign out
                </button>
              </div>
            </div>
          )}

          {requiresTwoFactor ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-3.5 text-center space-y-1.5">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ok)] shadow-xs">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <h3 className="text-xs font-semibold text-[var(--text)]">Two-Factor Authentication</h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Enter verification code for <span className="font-medium text-[var(--text)]">{email}</span>.
                </p>
              </div>

              <div>
                <label className="ui-label">Verification Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  required
                  autoFocus
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="ui-input text-center font-mono tracking-widest text-lg font-bold"
                />
              </div>

              {error && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || twoFactorCode.length !== 6}
                className="ui-btn ui-btn-primary w-full flex items-center justify-center gap-2 py-2.5 font-medium shadow-xs"
              >
                <span>{busy ? 'Verifying…' : 'Verify & Continue'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setRequiresTwoFactor(false);
                  setTwoFactorCode('');
                  setError('');
                }}
                className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text)] hover:underline pt-1"
              >
                ← Back to login
              </button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="ui-label">Email</label>
                <div className="relative mt-1">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="alex@axiomra.ai"
                    className="ui-input pr-9"
                  />
                  <Mail className="absolute right-3 top-3 h-4 w-4 text-[var(--text-faint)] pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="ui-label">Password</label>
                <div className="relative mt-1">
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="ui-input pr-9"
                  />
                  <Lock className="absolute right-3 top-3 h-4 w-4 text-[var(--text-faint)] pointer-events-none" />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="ui-btn ui-btn-primary w-full flex items-center justify-center gap-2 py-2.5 font-medium shadow-xs"
              >
                <span>{busy ? 'Signing in…' : 'Sign in'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>

        <div className="text-center text-[11px] text-[var(--text-faint)]">
          {companyConfig.name} · Encrypted session authentication
        </div>
      </div>
    </div>
  );
}
