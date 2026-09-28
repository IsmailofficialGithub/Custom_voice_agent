'use client';

import React from 'react';

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-12 text-sm text-[var(--text-muted)]" role="status">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border-strong)] border-t-[var(--text)]"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}

export function LoadingInline({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-xs text-[var(--text-muted)]">
      <span
        className="h-3 w-3 animate-spin rounded-full border border-[var(--border-strong)] border-t-[var(--text)]"
        aria-hidden
      />
      {label}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-10 text-center">
      <p className="text-sm font-medium text-[var(--text)]">{title}</p>
      {body && <p className="mt-1.5 text-xs text-[var(--text-muted)]">{body}</p>}
    </div>
  );
}
