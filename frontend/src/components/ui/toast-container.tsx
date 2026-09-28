'use client';

import React from 'react';
import { useToast } from '../../context/toast-context';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3 max-w-md w-full px-4 pointer-events-none">
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-4 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 transform translate-y-0 ${
              isError
                ? 'bg-rose-950/80 border-rose-500/50 text-rose-200'
                : isSuccess
                ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200'
                : isWarning
                ? 'bg-amber-950/80 border-amber-500/50 text-amber-200'
                : 'bg-slate-900/90 border-slate-700 text-slate-200'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                {isError && <AlertCircle className="w-5 h-5 text-rose-400 animate-pulse" />}
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                {isWarning && <AlertTriangle className="w-5 h-5 text-amber-400" />}
                {!isError && !isSuccess && !isWarning && <Info className="w-5 h-5 text-sky-400" />}
              </div>

              <div className="flex-1 min-w-0">
                <h4 className="font-semibold text-sm tracking-wide">{toast.title}</h4>
                <p className="text-xs mt-1 leading-relaxed opacity-90">{toast.message}</p>
                {toast.actionableHint && (
                  <div className="mt-2 pt-2 border-t border-white/10 text-[11px] font-medium text-amber-300/90 flex items-center gap-1.5">
                    <span>💡 Hint:</span>
                    <span>{toast.actionableHint}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => dismissToast(toast.id)}
                className="shrink-0 p-1 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
