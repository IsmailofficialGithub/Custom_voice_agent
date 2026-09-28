'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { parseUserFriendlyError, UserFriendlyError } from '../lib/error-handler';

export interface ToastMessage {
  id: string;
  type: 'error' | 'success' | 'warning' | 'info';
  title: string;
  message: string;
  actionableHint?: string;
}

interface ToastContextType {
  toasts: ToastMessage[];
  showToast: (type: ToastMessage['type'], title: string, message: string, actionableHint?: string) => void;
  showError: (err: unknown, contextLabel?: string) => void;
  showSuccess: (title: string, message: string) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastMessage['type'], title: string, message: string, actionableHint?: string) => {
      const id = `${Date.now()}-${Math.random()}`;
      const newToast: ToastMessage = { id, type, title, message, actionableHint };
      setToasts((prev) => [...prev.slice(-4), newToast]); // max 5 visible

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        dismissToast(id);
      }, 6000);
    },
    [dismissToast],
  );

  const showError = useCallback(
    (err: unknown, contextLabel = 'Action') => {
      const friendly: UserFriendlyError = parseUserFriendlyError(err, contextLabel);
      showToast('error', friendly.title, friendly.message, friendly.actionableHint);
    },
    [showToast],
  );

  const showSuccess = useCallback(
    (title: string, message: string) => {
      showToast('success', title, message);
    },
    [showToast],
  );

  return (
    <ToastContext.Provider value={{ toasts, showToast, showError, showSuccess, dismissToast }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
