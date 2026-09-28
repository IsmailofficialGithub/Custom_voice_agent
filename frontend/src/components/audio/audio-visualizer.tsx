'use client';

import React from 'react';
import uiConfig from '../../config/ui.json';

interface AudioVisualizerProps {
  isActive: boolean;
  audioLevel?: number;
  label?: string;
}

export function AudioVisualizer({ isActive, audioLevel = 0, label = 'Voice' }: AudioVisualizerProps) {
  const count = uiConfig.visualizer.barCount || 24;

  return (
    <div className="relative flex flex-col items-center justify-center overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="z-10 flex h-16 w-full items-end justify-center gap-1 px-3">
        {Array.from({ length: count }).map((_, i) => {
          const factor = Math.sin((i / count) * Math.PI);
          const heightPercent = isActive
            ? Math.max(8, Math.min(100, Math.round(audioLevel * factor * (0.85 + Math.random() * 0.3))))
            : 8;

          return (
            <div
              key={i}
              className={`w-1 rounded-sm transition-all duration-75 ${
                isActive ? 'bg-[var(--text)]' : 'bg-[var(--border-strong)]'
              }`}
              style={{ height: `${heightPercent}%` }}
            />
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-[var(--text-faint)]">{label}</p>
    </div>
  );
}
