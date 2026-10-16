'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient } from '../../lib/api-client';
import { ShieldCheck, ShieldAlert, Copy, Check, X, Loader2, QrCode } from 'lucide-react';

interface TwoFactorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TwoFactorModal({ isOpen, onClose }: TwoFactorModalProps) {
  const { apiKey, currentUser, refreshUser } = useAuth();
  const { showSuccess, showError } = useToast();

  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [qrData, setQrData] = useState<{ secret: string; qrCode: string; otpauthUrl: string } | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [disableMode, setDisableMode] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  const isEnabled = Boolean(currentUser.isTwoFactorEnabled);

  useEffect(() => {
    if (isOpen && !isEnabled && !qrData) {
      loadQrCode();
    }
    if (isOpen) {
      setVerificationCode('');
      setDisableCode('');
      setDisableMode(false);
    }
  }, [isOpen, isEnabled]);

  const loadQrCode = async () => {
    setLoading(true);
    try {
      const data = await apiClient.generateTwoFactor(apiKey);
      setQrData(data);
    } catch (err) {
      showError('Failed to generate 2FA setup', err instanceof Error ? err.message : 'Please check your connection');
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = () => {
    if (!qrData?.secret) return;
    navigator.clipboard.writeText(qrData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEnable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrData?.secret || verificationCode.length !== 6) return;

    setActionBusy(true);
    try {
      await apiClient.enableTwoFactor(qrData.secret, verificationCode, apiKey);
      await refreshUser();
      showSuccess('2FA Enabled', 'Two-factor authentication is now active on your account.');
      onClose();
    } catch (err) {
      showError('Verification failed', err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setActionBusy(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (disableCode.length !== 6) return;

    setActionBusy(true);
    try {
      await apiClient.disableTwoFactor(disableCode, apiKey);
      await refreshUser();
      showSuccess('2FA Disabled', 'Two-factor authentication has been turned off.');
      onClose();
    } catch (err) {
      showError('Failed to disable 2FA', err instanceof Error ? err.message : 'Invalid code');
    } finally {
      setActionBusy(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border)] pb-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--bg)] text-[var(--ok)] border border-[var(--border)]">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text)]">Two-Factor Authentication</h3>
              <p className="text-[11px] text-[var(--text-muted)]">Google Authenticator / TOTP</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        {isEnabled ? (
          // ALREADY ENABLED STATE
          <div className="space-y-4">
            <div className="rounded-lg border border-[var(--ok)]/30 bg-[var(--ok)]/10 p-4 text-center space-y-2">
              <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--ok)] shadow">
                <Check className="h-5 w-5" />
              </div>
              <h4 className="text-sm font-semibold text-[var(--ok)]">Two-Factor Authentication is Active</h4>
              <p className="text-xs text-[var(--text-muted)]">
                Your account is protected. A 6-digit verification code from your authenticator app is required every time you sign in.
              </p>
            </div>

            {!disableMode ? (
              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => setDisableMode(true)}
                  className="text-xs text-[var(--danger)] hover:underline"
                >
                  Turn off 2FA
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="ui-btn ui-btn-primary"
                >
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleDisable} className="space-y-3 rounded-lg border border-[var(--danger)]/30 bg-[var(--bg)] p-4">
                <div className="flex items-center gap-2 text-xs font-medium text-[var(--danger)]">
                  <ShieldAlert className="h-4 w-4" />
                  <span>Confirm Disabling Two-Factor Auth</span>
                </div>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Enter the current 6-digit code from your authenticator app to confirm turning off 2FA.
                </p>
                <input
                  type="text"
                  maxLength={6}
                  required
                  autoFocus
                  value={disableCode}
                  onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="ui-input text-center font-mono tracking-widest text-lg font-bold"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setDisableMode(false)}
                    className="ui-btn ui-btn-ghost text-xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={actionBusy || disableCode.length !== 6}
                    className="ui-btn ui-btn-danger text-xs"
                  >
                    {actionBusy ? 'Disabling…' : 'Disable 2FA'}
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          // NOT ENABLED - SETUP WIZARD
          <div className="space-y-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-2 text-xs text-[var(--text-muted)]">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--ok)]" />
                <span>Generating secure QR key…</span>
              </div>
            ) : qrData ? (
              <div className="space-y-4">
                <div className="space-y-1">
                  <span className="text-xs font-semibold text-[var(--text)]">Step 1: Scan with Authenticator App</span>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    Scan this QR code using Google Authenticator, Microsoft Authenticator, or 1Password.
                  </p>
                </div>

                {/* QR Code Container */}
                <div className="flex flex-col items-center justify-center rounded-lg border border-[var(--border)] bg-white p-4 shadow-inner">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qrData.qrCode}
                    alt="2FA QR Code"
                    className="h-44 w-44 object-contain"
                  />
                </div>

                {/* Manual Secret Key */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)]">
                    <span>Or enter code manually:</span>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="flex items-center gap-1 font-mono text-[var(--text)] hover:underline"
                    >
                      {copied ? <Check className="h-3 w-3 text-[var(--ok)]" /> : <Copy className="h-3 w-3" />}
                      <span>{copied ? 'Copied' : 'Copy Key'}</span>
                    </button>
                  </div>
                  <div className="rounded border border-[var(--border)] bg-[var(--bg)] px-2.5 py-1.5 font-mono text-xs text-[var(--text-muted)] select-all break-all text-center">
                    {qrData.secret}
                  </div>
                </div>

                {/* Step 2: Verification */}
                <form onSubmit={handleEnable} className="space-y-3 border-t border-[var(--border)] pt-3">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold text-[var(--text)]">Step 2: Enter 6-digit code</span>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Type the 6-digit code generated in your app to activate.
                    </p>
                  </div>

                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    required
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="123456"
                    className="ui-input text-center font-mono tracking-widest text-lg font-bold"
                  />

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="ui-btn ui-btn-ghost text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={actionBusy || verificationCode.length !== 6}
                      className="ui-btn ui-btn-primary text-xs flex items-center gap-2"
                    >
                      {actionBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      <span>{actionBusy ? 'Verifying…' : 'Activate 2FA'}</span>
                    </button>
                  </div>
                </form>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
