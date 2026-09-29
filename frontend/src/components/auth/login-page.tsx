'use client';

import React, { useState } from 'react';
import { useAuth } from '../../context/auth-context';

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg)] px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-6">
        <div>
          <h1 className="text-lg font-semibold text-[var(--text)]">Sign in</h1>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Use the email and password from the server env.</p>
        </div>
        <div>
          <label className="ui-label">Email</label>
          <input className="ui-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="ui-label">Password</label>
          <input className="ui-input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        {error && <p className="text-xs text-[var(--danger)]">{error}</p>}
        <button type="submit" disabled={busy} className="ui-btn ui-btn-primary w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
