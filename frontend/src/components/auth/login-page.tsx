'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import { apiClient } from '../../lib/api-client';
import companyConfig from '../../config/company.json';
import { Key, Mail, Lock, User as UserIcon, ArrowRight, ShieldCheck, Sparkles, CheckCircle2 } from 'lucide-react';

export function LoginPage() {
  const router = useRouter();
  const { login, register, loginWithApiKey, apiKey, currentUser, logout } = useAuth();

  const [authMethod, setAuthMethod] = useState<'password' | 'apikey'>('password');
  const [formMode, setFormMode] = useState<'login' | 'setup' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [devKey, setDevKey] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);

  useEffect(() => {
    apiClient
      .getSetupStatus()
      .then((status) => {
        if (!status.isSetup) {
          setFormMode('setup');
        } else {
          setFormMode('login');
        }
      })
      .catch(() => {})
      .finally(() => {
        setSetupChecked(true);
      });
  }, []);

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formMode === 'setup' || formMode === 'register') {
      if (password.length < 6) {
        setError('Password must be at least 6 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }

      setBusy(true);
      try {
        await register(email, password, name);
        router.push('/');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Registration failed');
      } finally {
        setBusy(false);
      }
      return;
    }

    setBusy(true);
    try {
      await login(email, password);
      router.push('/');
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

          {/* First time setup banner */}
          {formMode === 'setup' && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/20 p-3 text-xs text-emerald-300 space-y-1">
              <div className="flex items-center gap-2 font-semibold text-emerald-400">
                <Sparkles className="h-4 w-4 text-emerald-400" />
                <span>First-Time Setup · Create Database Password</span>
              </div>
              <p className="text-[11px] text-emerald-300/80">
                Welcome! Create your master password. It will be stored securely as a hashed record in the database.
              </p>
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
              {(formMode === 'setup' || formMode === 'register') && (
                <div>
                  <label className="ui-label">Your Name</label>
                  <div className="relative mt-1">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Admin"
                      className="ui-input pr-8"
                    />
                    <UserIcon className="absolute right-2.5 top-2.5 h-4 w-4 text-[var(--text-faint)] pointer-events-none" />
                  </div>
                </div>
              )}

              <div>
                <label className="ui-label">Email address</label>
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
                <label className="ui-label">
                  {formMode === 'setup' ? 'Create Password' : 'Password'}
                </label>
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

              {(formMode === 'setup' || formMode === 'register') && (
                <div>
                  <label className="ui-label">Confirm Password</label>
                  <div className="relative mt-1">
                    <input
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="ui-input pr-8"
                    />
                    <CheckCircle2 className="absolute right-2.5 top-2.5 h-4 w-4 text-[var(--text-faint)] pointer-events-none" />
                  </div>
                </div>
              )}

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
                <span>
                  {busy
                    ? 'Processing…'
                    : formMode === 'setup'
                    ? 'Create Database Account & Sign In'
                    : formMode === 'register'
                    ? 'Register Account'
                    : 'Sign In'}
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>

              {/* Mode Switcher */}
              <div className="pt-2 text-center text-xs text-[var(--text-muted)]">
                {formMode === 'login' && (
                  <button
                    type="button"
                    onClick={() => { setFormMode('register'); setError(''); }}
                    className="hover:text-[var(--text)] hover:underline"
                  >
                    Need an account? Create one here
                  </button>
                )}
                {formMode === 'register' && (
                  <button
                    type="button"
                    onClick={() => { setFormMode('login'); setError(''); }}
                    className="hover:text-[var(--text)] hover:underline"
                  >
                    Already have an account? Sign in
                  </button>
                )}
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

        {/* Footer info */}
        <p className="text-center text-[11px] text-[var(--text-faint)]">
          Database User Table Auth · Hashed with scrypt & Salt · 30-Day JWT Session
        </p>
      </div>
    </div>
  );
}
