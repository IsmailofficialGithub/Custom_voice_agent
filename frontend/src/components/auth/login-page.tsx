'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import companyConfig from '../../config/company.json';
import { Key, Mail, Lock, ArrowRight, ShieldCheck } from 'lucide-react';

export function LoginPage() {
  const router = useRouter();
  const { login, loginWithApiKey, apiKey, currentUser, logout } = useAuth();

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
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface)] text-xl font-bold font-mono text-[var(--text)] shadow-lg">
            {companyConfig.logo}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
            Sign in to your account
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {companyConfig.name} · {companyConfig.tagline}
          </p>
        </div>

        {/* Card */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-xl space-y-5">
          {/* If already authenticated notice */}
          {apiKey && (
            <div className="rounded-lg border border-[var(--ok)]/40 bg-[var(--ok)]/10 p-3 text-xs text-[var(--text)] space-y-2">
              <div className="flex items-center gap-2 font-medium text-[var(--ok)]">
                <ShieldCheck className="h-4 w-4" />
                <span>Currently signed in as {currentUser.email || currentUser.name}</span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="font-semibold text-white underline hover:opacity-80"
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

          {/* Method selector tabs (hidden when 2FA code is being entered) */}
          {!requiresTwoFactor && (
            <div className="grid grid-cols-2 gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => { setAuthMethod('password'); setError(''); }}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all ${
                  authMethod === 'password'
                    ? 'bg-[var(--surface)] text-[var(--text)] shadow'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Email & Password</span>
              </button>
              <button
                type="button"
                onClick={() => { setAuthMethod('apikey'); setError(''); }}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all ${
                  authMethod === 'apikey'
                    ? 'bg-[var(--surface)] text-[var(--text)] shadow'
                    : 'text-[var(--text-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Key className="h-3.5 w-3.5" />
                <span>Developer Key</span>
              </button>
            </div>
          )}

          {/* Password Auth Form */}
          {authMethod === 'password' && (
            requiresTwoFactor ? (
              <form onSubmit={handleSubmitPassword} className="space-y-4">
                <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] p-4 text-center space-y-2">
                  <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ok)] shadow">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--text)]">Two-Factor Authentication</h3>
                  <p className="text-xs text-[var(--text-muted)]">
                    Enter the 6-digit verification code from your authenticator app for <span className="font-medium text-[var(--text)]">{email}</span>.
                  </p>
                </div>

                <div>
                  <label className="ui-label">6-Digit Code</label>
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
                  <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy || twoFactorCode.length !== 6}
                  className="ui-btn ui-btn-primary w-full flex items-center justify-center gap-2 py-2"
                >
                  <span>{busy ? 'Verifying…' : 'Verify & Sign In'}</span>
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
                  <label className="ui-label">Email</label>
                  <div className="relative mt-1">
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      className="ui-input pr-8"
                    />
                    <Mail className="absolute right-2.5 top-2.5 h-4 w-4 text-[var(--text-faint)] pointer-events-none" />
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
                      placeholder="••••••••"
                      className="ui-input pr-8"
                    />
                    <Lock className="absolute right-2.5 top-2.5 h-4 w-4 text-[var(--text-faint)] pointer-events-none" />
                  </div>
                </div>

                {error && (
                  <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="ui-btn ui-btn-primary w-full flex items-center justify-center gap-2 py-2"
                >
                  <span>{busy ? 'Signing in…' : 'Sign In'}</span>
                  <ArrowRight className="h-4 w-4" />
                </button>
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
                    className="ui-input font-mono pr-8"
                  />
                  <Key className="absolute right-2.5 top-2.5 h-4 w-4 text-[var(--text-faint)] pointer-events-none" />
                </div>
              </div>

              {error && (
                <div className="rounded-md border border-[var(--danger)]/30 bg-[var(--danger)]/10 p-2.5 text-xs text-[var(--danger)]">
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="ui-btn ui-btn-primary w-full flex items-center justify-center gap-2 py-2"
              >
                <span>Continue with API Key</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
