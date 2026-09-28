'use client';

import React from 'react';
import { useToast } from '../../context/toast-context';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export function ToastContainer() {
  const { toasts, dismissToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-50 flex w-full max-w-sm flex-col gap-2 px-2">
      {toasts.map((toast) => {
        const isError = toast.type === 'error';
        const isSuccess = toast.type === 'success';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl"
          >
            <div className="flex items-start gap-2.5">
              <div className="mt-0.5 shrink-0 text-[var(--text-muted)]">
                {isError && <AlertCircle className="h-4 w-4 text-[var(--danger)]" />}
                {isSuccess && <CheckCircle2 className="h-4 w-4 text-[var(--ok)]" />}
                {isWarning && <AlertTriangle className="h-4 w-4 text-[var(--warn)]" />}
                {!isError && !isSuccess && !isWarning && <Info className="h-4 w-4" />}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-medium text-[var(--text)]">{toast.title}</h4>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-muted)]">{toast.message}</p>
                {toast.actionableHint && (
                  <p className="mt-2 border-t border-[var(--border)] pt-2 text-[11px] text-[var(--text-faint)]">
                    {toast.actionableHint}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="rounded p-1 text-[var(--text-faint)] hover:bg-[var(--bg)] hover:text-[var(--text)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
