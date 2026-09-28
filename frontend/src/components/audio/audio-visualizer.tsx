'use client';

import React from 'react';
import uiConfig from '../../config/ui.json';

interface AudioVisualizerProps {
  isActive: boolean;
  audioLevel?: number; // 0 to 100
  label?: string;
}

export function AudioVisualizer({ isActive, audioLevel = 0, label = 'Voice Audio' }: AudioVisualizerProps) {
  const count = uiConfig.visualizer.barCount || 24;

  return (
    <div className="flex flex-col items-center justify-center p-6 glass-panel rounded-2xl border border-white/10 relative overflow-hidden">
      {/* Background Pulse Effect */}
      {isActive && (
        <div
          className="absolute inset-0 bg-purple-600/10 transition-opacity duration-300 pointer-events-none"
          style={{ opacity: Math.min(1, 0.2 + audioLevel / 100) }}
        />
      )}

      {/* Visualizer Bars */}
      <div className="flex items-end justify-center gap-1.5 h-20 w-full px-4 z-10">
        {Array.from({ length: count }).map((_, i) => {
          // Compute pseudo-dynamic height based on index & audioLevel
          const factor = Math.sin((i / count) * Math.PI);
          const heightPercent = isActive
            ? Math.max(10, Math.min(100, Math.round(audioLevel * factor * (0.8 + Math.random() * 0.4))))
            : 8;

          return (
            <div
              key={i}
              className={`w-1.5 rounded-full transition-all duration-75 ${
                isActive
                  ? 'bg-gradient-to-t from-purple-600 via-indigo-500 to-cyan-400 shadow-md shadow-purple-500/30'
                  : 'bg-slate-800'
              }`}
              style={{ height: `${heightPercent}%` }}
            />
          );
        })}
      </div>

      <div className="mt-4 text-xs font-semibold tracking-wider text-slate-300 z-10 flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-ping' : 'bg-slate-600'}`} />
        <span>{isActive ? `${label} (${audioLevel}%)` : 'Mic Idle'}</span>
      </div>
    </div>
  );
}
