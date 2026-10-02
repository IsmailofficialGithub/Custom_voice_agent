'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import companyConfig from '../../config/company.json';
import { Key, Mail, Lock, ArrowRight, ShieldCheck, Sparkles } from 'lucide-react';

export function LoginPage() {
  const router = useRouter();
  const { login, loginWithApiKey, apiKey, currentUser, logout } = useAuth();

  const [authMethod, setAuthMethod] = useState<'password' | 'apikey'>('password');
  const [email, setEmail] = useState('admin@axiomra.ai');
  const [password, setPassword] = useState('password123');
  const [devKey, setDevKey] = useState('dev-secret-key-change-me');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials. Check server environment.');
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
            Welcome to {companyConfig.name}
          </h1>
          <p className="text-xs text-[var(--text-muted)]">
            {companyConfig.tagline} · v{companyConfig.version}
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

          {/* Method selector tabs */}
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

          {/* Password Auth Form */}
          {authMethod === 'password' && (
            <form onSubmit={handleSubmitPassword} className="space-y-4">
              <div>
                <label className="ui-label">Email address</label>
                <div className="relative mt-1">
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@axiomra.ai"
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
                <span>{busy ? 'Authenticating…' : 'Sign In'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="pt-2 border-t border-[var(--border)] text-center">
                <button
                  type="button"
                  onClick={() => {
                    setEmail('admin@axiomra.ai');
                    setPassword('password123');
                  }}
                  className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <Sparkles className="h-3 w-3 text-[var(--warn)]" />
                  <span>Fill default credentials (admin@axiomra.ai / password123)</span>
                </button>
              </div>
            </form>
          )}

          {/* API Key Form */}
          {authMethod === 'apikey' && (
            <form onSubmit={handleSubmitApiKey} className="space-y-4">
              <div>
                <label className="ui-label">Bearer Developer API Key</label>
                <p className="mb-2 text-[11px] text-[var(--text-muted)]">
                  Matches <code className="font-mono text-[var(--text)]">API_KEY</code> defined in your server environment.
                </p>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={devKey}
                    onChange={(e) => setDevKey(e.target.value)}
                    placeholder="dev-secret-key-change-me"
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

              <div className="pt-2 border-t border-[var(--border)] text-center">
                <button
                  type="button"
                  onClick={() => setDevKey('dev-secret-key-change-me')}
                  className="inline-flex items-center gap-1.5 text-[11px] text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  <Sparkles className="h-3 w-3 text-[var(--warn)]" />
                  <span>Fill default developer key (dev-secret-key-change-me)</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-[var(--text-faint)]">
          Protected by NestJS API Guard & JWT Session Authentication
        </p>
      </div>
    </div>
  );
}
