'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient } from '../../lib/api-client';
import companyConfig from '../../config/company.json';
import { Key, Activity, User, LogOut, Check, Shield, Sparkles } from 'lucide-react';

export function Header() {
  const { currentUser, switchUser, demoUsers, apiKey, setApiKey, logout } = useAuth();
  const { showSuccess, showError } = useToast();

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
      if (res.status === 'ok') {
        setHealthStatus('connected');
      } else {
        setHealthStatus('error');
      }
    } catch {
      setHealthStatus('error');
    }
  };

  const handleSaveKey = () => {
    setApiKey(tempApiKey.trim());
    setShowKeyModal(false);
    showSuccess('API Key Updated', 'Developer API Key saved successfully.');
  };

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-white/10 px-6 py-3.5 flex items-center justify-between">
      {/* Brand & Logo */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 to-indigo-500 flex items-center justify-center text-xl shadow-lg shadow-purple-500/25">
          {companyConfig.logo}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-extrabold text-lg tracking-tight gradient-text">{companyConfig.name}</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono border border-purple-500/30">
              {companyConfig.version}
            </span>
          </div>
          <p className="text-xs text-slate-400 font-medium">{companyConfig.tagline}</p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center gap-4">
        {/* Backend Health Status Badge */}
        <div
          onClick={checkHealth}
          className="cursor-pointer flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 text-xs font-medium hover:border-slate-700 transition-colors"
          title="Click to re-check backend API status"
        >
          <Activity className={`w-3.5 h-3.5 ${healthStatus === 'connected' ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
          <span className="text-slate-300">
            Backend: {healthStatus === 'connected' ? <span className="text-emerald-400 font-semibold">Online</span> : <span className="text-rose-400 font-semibold">Offline</span>}
          </span>
        </div>

        {/* API Key Manager Button */}
        <button
          onClick={() => {
            setTempApiKey(apiKey);
            setShowKeyModal(true);
          }}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-semibold transition-all hover:scale-105"
        >
          <Key className="w-3.5 h-3.5" />
          <span>API Key</span>
        </button>

        {/* User Profile & Role Switcher */}
        <div className="relative">
          <button
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="flex items-center gap-2.5 p-1.5 pr-3 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/40 transition-all text-left"
          >
            <img src={currentUser.avatar} alt={currentUser.name} className="w-8 h-8 rounded-lg bg-slate-800" />
            <div className="hidden sm:block">
              <div className="text-xs font-bold text-slate-200 flex items-center gap-1">
                <span>{currentUser.name}</span>
                <Shield className="w-3 h-3 text-purple-400" />
              </div>
              <div className="text-[10px] text-purple-300 uppercase tracking-wider font-semibold">{currentUser.role}</div>
            </div>
          </button>

          {/* User Dropdown Menu */}
          {showUserDropdown && (
            <div className="absolute right-0 mt-2 w-72 glass-panel rounded-2xl p-3 shadow-2xl border border-white/10 z-50">
              <div className="px-3 py-2 border-b border-white/10 mb-2">
                <div className="text-xs font-bold text-slate-200">{currentUser.name}</div>
                <div className="text-[11px] text-slate-400">{currentUser.email}</div>
              </div>

              <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Switch Multi-User Demo Persona</div>

              <div className="space-y-1 mb-2">
                {demoUsers.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => {
                      switchUser(user.id);
                      setShowUserDropdown(false);
                      showSuccess('User Switched', `Logged in as ${user.name} (${user.role.toUpperCase()})`);
                    }}
                    className={`w-full flex items-center justify-between p-2 rounded-xl text-xs transition-colors ${
                      user.id === currentUser.id ? 'bg-purple-600/30 text-purple-200 font-semibold border border-purple-500/40' : 'hover:bg-white/5 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <img src={user.avatar} alt={user.name} className="w-6 h-6 rounded-md" />
                      <div className="text-left">
                        <div>{user.name}</div>
                        <div className="text-[9px] opacity-75">{user.role}</div>
                      </div>
                    </div>
                    {user.id === currentUser.id && <Check className="w-4 h-4 text-purple-400" />}
                  </button>
                ))}
              </div>

              <div className="border-t border-white/10 pt-2">
                <button
                  onClick={() => {
                    logout();
                    setShowUserDropdown(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-xl transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Reset Default User</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="glass-panel w-full max-w-md rounded-2xl p-6 shadow-2xl border border-white/15">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-base text-slate-100">Developer API Authorization</h3>
              </div>
              <button onClick={() => setShowKeyModal(false)} className="text-slate-400 hover:text-white">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 mb-4 leading-relaxed">
              Enter your backend secret API Key (matches <code className="text-purple-300 bg-purple-950/60 px-1 py-0.5 rounded">API_KEY</code> in backend <code className="text-purple-300 bg-purple-950/60 px-1 py-0.5 rounded">.env</code>).
            </p>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Authorization Bearer Key</label>
              <input
                type="text"
                value={tempApiKey}
                onChange={(e) => setTempApiKey(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono focus:outline-none focus:border-purple-500"
                placeholder="dev-secret-key-change-me"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowKeyModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveKey}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/20"
              >
                Save API Key
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
