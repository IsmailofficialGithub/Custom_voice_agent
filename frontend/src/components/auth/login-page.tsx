'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import companyConfig from '../../config/company.json';
import { Key, Mail, Lock, ArrowRight, ShieldCheck, Sun, Moon, Sparkles } from 'lucide-react';

export function LoginPage() {
  const router = useRouter();
  const { login, loginWithApiKey, apiKey, currentUser, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const [authMethod, setAuthMethod] = useState<'password' | 'apikey'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [devKey, setDevKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmitPassword = async (e: React.FormEvent) => {
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

  const handleSubmitApiKey = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      loginWithApiKey(devKey);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid API key');
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--bg)] px-4 py-12 transition-colors duration-200">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-[36rem] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 -z-10 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />

      {/* Top right theme toggle */}
      <div className="absolute top-5 right-5 z-20">
        <button
          type="button"
          onClick={toggleTheme}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--text-muted)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text)] shadow-sm"
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

      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-md transition-transform duration-200 hover:scale-105">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt={companyConfig.name} className="h-full w-full object-contain" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--text-muted)] mb-2 shadow-xs">
              <Sparkles className="h-3 w-3 text-indigo-500" />
              <span>Voice AI & Automation</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
              Welcome back
            </h1>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Sign in to manage your {companyConfig.name} voice workspace
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-xl space-y-5 transition-colors duration-200">
          {/* If already authenticated notice */}
          {apiKey && (
            <div className="rounded-xl border border-[var(--ok)]/30 bg-[var(--ok)]/10 p-3.5 text-xs text-[var(--text)] space-y-2">
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

          {/* Method selector tabs */}
          {!requiresTwoFactor && (
            <div className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => { setAuthMethod('password'); setError(''); }}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${
                  authMethod === 'password'
                    ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Password</span>
              </button>
              <button
                type="button"
                onClick={() => { setAuthMethod('apikey'); setError(''); }}
                className={`flex items-center justify-center gap-2 py-2 rounded-lg transition-all ${
                  authMethod === 'apikey'
                    ? 'bg-[var(--surface)] text-[var(--text)] shadow-sm font-semibold'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Key className="h-3.5 w-3.5" />
                <span>API Key</span>
              </button>
            </div>
          )}

          {/* Password Auth Form */}
          {authMethod === 'password' && (
            requiresTwoFactor ? (
              <form onSubmit={handleSubmitPassword} className="space-y-4">
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 text-center space-y-2">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ok)] shadow-sm">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text)]">Two-Factor Authentication</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Enter the 6-digit code for <span className="font-medium text-[var(--text)]">{email}</span>.
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
                  className="ui-btn ui-btn-primary w-full flex items-center justify-center gap-2 py-2.5 font-medium shadow-sm transition-all"
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
              <form onSubmit={handleSubmitPassword} className="space-y-4">
                <div>
                  <label className="ui-label">Email address</label>
                  <div className="relative mt-1">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="alex@axiomra.ai"
                      className="ui-input pr-9 focus:ring-2 focus:ring-indigo-500/20"
                    />
                    <Mail className="absolute right-3 top-3 h-4 w-4 text-[var(--text-faint)] pointer-events-none" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="ui-label mb-0">Password</label>
                  </div>
                  <div className="relative mt-1">
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="ui-input pr-9 focus:ring-2 focus:ring-indigo-500/20"
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
                  className="ui-btn ui-btn-primary w-full flex items-center justify-center gap-2 py-2.5 font-medium shadow-sm transition-all"
                >
                  <span>{busy ? 'Signing in…' : 'Sign In'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>

                {/* Helpful hints for demo */}
                <div className="pt-2 text-center text-[11px] text-[var(--text-muted)]">
                  <span>Demo access: </span>
                  <button
                    type="button"
                    onClick={() => {
                      setEmail('alex@axiomra.ai');
                      setPassword('password123');
                    }}
                    className="font-medium text-[var(--accent)] underline hover:opacity-80 ml-1"
                  >
                    Fill demo credentials
                  </button>
                </div>
              </form>
            )
          )}

          {/* API Key Form */}
          {authMethod === 'apikey' && (
            <form onSubmit={handleSubmitApiKey} className="space-y-4">
              <div>
                <label className="ui-label">Developer API Key</label>
                <div className="relative mt-1">
                  <input
                    type="text"
                    required
                    value={devKey}
                    onChange={(e) => setDevKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="ui-input font-mono pr-9 focus:ring-2 focus:ring-indigo-500/20"
                  />
                  <Key className="absolute right-3 top-3 h-4 w-4 text-[var(--text-faint)] pointer-events-none" />
                </div>
                <p className="mt-1.5 text-[11px] text-[var(--text-faint)]">
                  For quick developer access directly to the voice API.
                </p>
              </div>

              {error && (
                <div className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="ui-btn ui-btn-primary w-full flex items-center justify-center gap-2 py-2.5 font-medium shadow-sm transition-all"
              >
                <span>Continue with API Key</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-[var(--text-faint)]">
          {companyConfig.name} v{companyConfig.version} · Protected by 2FA & encrypted sessions
        </div>
      </div>
    </div>
  );
}
