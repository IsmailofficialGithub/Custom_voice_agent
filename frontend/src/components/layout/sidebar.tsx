'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import uiConfig from '../../config/ui.json';
import { LayoutDashboard, Bot, Mic, FileText, Brain, Shield, ChevronRight } from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="w-5 h-5" />,
  Bot: <Bot className="w-5 h-5" />,
  Mic: <Mic className="w-5 h-5" />,
  FileText: <FileText className="w-5 h-5" />,
  Brain: <Brain className="w-5 h-5" />,
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 glass-panel border-r border-white/10 p-4 flex flex-col justify-between shrink-0 hidden md:flex">
      <div className="space-y-6">
        <div className="px-3 py-1 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Navigation</div>

        <nav className="space-y-1.5">
          {uiConfig.navigation.map((item) => {
            const isActive = pathname === item.href;
            const icon = ICON_MAP[item.icon] || <Bot className="w-5 h-5" />;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-between px-3.5 py-3 rounded-xl text-xs font-semibold transition-all duration-200 ${
                  isActive
                    ? 'bg-gradient-to-r from-purple-600/30 to-indigo-600/20 text-purple-200 border border-purple-500/40 shadow-lg shadow-purple-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={isActive ? 'text-purple-400' : 'text-slate-400'}>{icon}</span>
                  <span>{item.title}</span>
                </div>
                {isActive && <ChevronRight className="w-4 h-4 text-purple-400" />}
              </Link>
            );
          })}
        </nav>
      </div>

      {/* System Status Footer */}
      <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800/80">
        <div className="flex items-center justify-between text-[11px] font-bold text-slate-300 mb-1">
          <span>Axirom Platform</span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </div>
        <div className="text-[10px] text-slate-400">pgvector RAG & WebSocket Engine Active</div>
      </div>
    </aside>
  );
}
