'use client';

import React, { useState } from 'react';
import { useAuth } from '../../context/auth-context';
import { useTheme } from '../../context/theme-context';
import { useToast } from '../../context/toast-context';
import { apiClient } from '../../lib/api-client';
import { validatePassword } from '../../lib/validator';
import { TwoFactorModal } from '../../components/auth/two-factor-modal';
import { ShieldCheck, Sun, Moon } from 'lucide-react';

export default function SettingsPage() {
  const { currentUser, apiKey, refreshUser } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { showError, showSuccess } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [show2FA, setShow2FA] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validatePassword(newPassword);
    if (!check.isValid) return showError(new Error(check.error), 'Password');
    if (newPassword !== confirmPassword) return showError(new Error('New passwords do not match'), 'Password');

    setSaving(true);
    try {
      await apiClient.changePassword(
        { currentPassword, newPassword, twoFactorCode: twoFactorCode || undefined },
        apiKey,
      );
      showSuccess('Password updated', 'Use your new password next time you sign in.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTwoFactorCode('');
    } catch (err) {
      showError(err, 'Password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="ui-page space-y-6">
      <div>
        <h1 className="ui-title">Settings</h1>
        <p className="ui-subtitle">Manage your profile, password, security and appearance.</p>
      </div>

      <section className="glass-panel rounded-xl p-5 space-y-3">
        <h2 className="text-sm font-semibold text-[var(--text)]">Profile</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className="ui-label">Name</span>
            <p className="text-sm text-[var(--text)]">{currentUser.name}</p>
          </div>
          <div>
            <span className="ui-label">Email</span>
            <p className="text-sm text-[var(--text)]">{currentUser.email}</p>
          </div>
          <div>
            <span className="ui-label">Role</span>
            <p className="text-sm capitalize text-[var(--text)]">{currentUser.role}</p>
          </div>
        </div>
      </section>

      <section className="glass-panel rounded-xl p-5">
        <h2 className="mb-4 text-sm font-semibold text-[var(--text)]">Change password</h2>
        <form onSubmit={handleChangePassword} className="grid gap-4 sm:max-w-md">
          <label>
            <span className="ui-label">Current password</span>
            <input type="password" className="ui-input" autoComplete="current-password" required
              value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </label>
          <label>
            <span className="ui-label">New password</span>
            <input type="password" className="ui-input" autoComplete="new-password" required
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <label>
            <span className="ui-label">Confirm new password</span>
            <input type="password" className="ui-input" autoComplete="new-password" required
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </label>
          {currentUser.isTwoFactorEnabled && (
            <label>
              <span className="ui-label">Two-factor code</span>
              <input inputMode="numeric" maxLength={6} className="ui-input" required
                value={twoFactorCode} onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))} />
            </label>
          )}
          <div>
            <button type="submit" className="ui-btn ui-btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Update password'}
            </button>
          </div>
        </form>
      </section>

      <section className="glass-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Two-factor authentication</h2>
          <p className="text-xs text-[var(--text-muted)]">
            {currentUser.isTwoFactorEnabled ? 'Enabled' : 'Not enabled'} — adds a code from your authenticator app at sign-in.
          </p>
        </div>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setShow2FA(true)}>
          <ShieldCheck className={`h-4 w-4 ${currentUser.isTwoFactorEnabled ? 'text-[var(--ok)]' : ''}`} />
          {currentUser.isTwoFactorEnabled ? 'Manage' : 'Enable'}
        </button>
      </section>

      <section className="glass-panel rounded-xl p-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text)]">Appearance</h2>
          <p className="text-xs text-[var(--text-muted)]">Currently using {theme} mode.</p>
        </div>
        <button type="button" className="ui-btn ui-btn-ghost" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          Switch to {theme === 'dark' ? 'light' : 'dark'}
        </button>
      </section>

      <TwoFactorModal
        isOpen={show2FA}
        onClose={() => {
          setShow2FA(false);
          refreshUser?.();
        }}
      />
    </div>
  );
}
