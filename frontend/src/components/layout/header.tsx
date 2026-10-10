'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient } from '../../lib/api-client';
import companyConfig from '../../config/company.json';
import { Key, Activity, LogOut, Check, Shield } from 'lucide-react';

export function Header() {
  const { currentUser, switchUser, demoUsers, apiKey, setApiKey, logout } = useAuth();
  const { showSuccess } = useToast();

  const [healthStatus, setHealthStatus] = useState<'connected' | 'error' | 'checking'>('checking');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [tempApiKey, setTempApiKey] = useState(apiKey);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 15000);
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

  const handleSaveKey = () => {
    setApiKey(tempApiKey.trim());
    setShowKeyModal(false);
    showSuccess('API key saved', 'Authorization updated.');
  };

  return (
    <header className="sticky top-0 z-40 flex w-full items-center justify-between border-b border-[var(--border)] bg-[var(--bg-elevated)] px-5 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--surface)] font-mono text-sm font-semibold text-[var(--text)]">
          {companyConfig.logo}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-semibold tracking-tight text-[var(--text)]">{companyConfig.name}</h1>
            <span className="font-mono text-[10px] text-[var(--text-faint)]">{companyConfig.version}</span>
          </div>
          <p className="text-xs text-[var(--text-muted)]">{companyConfig.tagline}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <button
          type="button"
          onClick={checkHealth}
          className="hidden items-center gap-2 rounded-md border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-muted)] hover:border-[var(--border-strong)] sm:inline-flex"
          title="Recheck backend"
        >
          <Activity
            className={`h-3.5 w-3.5 ${healthStatus === 'connected' ? 'text-[var(--ok)]' : healthStatus === 'checking' ? 'text-[var(--text-faint)]' : 'text-[var(--danger)]'}`}
          />
          <span>{healthStatus === 'connected' ? 'Online' : healthStatus === 'checking' ? 'Checking' : 'Offline'}</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setTempApiKey(apiKey);
            setShowKeyModal(true);
          }}
          className="ui-btn ui-btn-ghost"
        >
          <Key className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">API key</span>
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="flex items-center gap-2 rounded-md border border-[var(--border)] p-1.5 pr-2.5 text-left hover:border-[var(--border-strong)]"
          >
            <img src={currentUser.avatar} alt="" className="h-7 w-7 rounded bg-[var(--surface)]" />
            <div className="hidden sm:block">
              <div className="flex items-center gap-1 text-xs font-medium text-[var(--text)]">
                {currentUser.name}
                <Shield className="h-3 w-3 text-[var(--text-faint)]" />
              </div>
              <div className="text-[10px] uppercase tracking-wide text-[var(--text-muted)]">{currentUser.role}</div>
            </div>
          </button>

          {showUserDropdown && (
            <div className="absolute right-0 z-50 mt-2 w-72 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2 shadow-xl">
              <div className="border-b border-[var(--border)] px-2 py-2">
                <div className="text-xs font-medium text-[var(--text)]">{currentUser.name}</div>
                <div className="text-[11px] text-[var(--text-muted)]">{currentUser.email}</div>
              </div>
              <p className="ui-label mt-2 px-2">Switch user</p>
              <div className="space-y-0.5">
                {demoUsers.map((user) => (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => {
                      switchUser(user.id);
                      setShowUserDropdown(false);
                      showSuccess('Switched', user.name);
                    }}
                    className={`flex w-full items-center justify-between rounded-md p-2 text-xs ${
                      user.id === currentUser.id
                        ? 'bg-[var(--bg)] text-[var(--text)]'
                        : 'text-[var(--text-muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--text)]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <img src={user.avatar} alt="" className="h-6 w-6 rounded" />
                      <div className="text-left">
                        <div>{user.name}</div>
                        <div className="text-[10px] opacity-70">{user.role}</div>
                      </div>
                    </div>
                    {user.id === currentUser.id && <Check className="h-3.5 w-3.5" />}
                  </button>
                ))}
              </div>
              <div className="mt-2 border-t border-[var(--border)] pt-2">
                <button
                  type="button"
                  onClick={() => {
                    logout();
                    setShowUserDropdown(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-xs text-[var(--danger)] hover:bg-[var(--bg)]"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text)]">API key</h3>
              <button type="button" onClick={() => setShowKeyModal(false)} className="text-[var(--text-muted)] hover:text-[var(--text)]">
                Close
              </button>
            </div>
            <p className="mb-3 text-xs leading-relaxed text-[var(--text-muted)]">
              Must match <code className="font-mono text-[var(--text)]">API_KEY</code> in the backend env.
            </p>
            <label className="ui-label">Bearer key</label>
            <input
              type="text"
              value={tempApiKey}
              onChange={(e) => setTempApiKey(e.target.value)}
              className="ui-input font-mono"
              placeholder="Enter your API key"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={() => setShowKeyModal(false)} className="ui-btn ui-btn-ghost">
                Cancel
              </button>
              <button type="button" onClick={handleSaveKey} className="ui-btn ui-btn-primary">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
