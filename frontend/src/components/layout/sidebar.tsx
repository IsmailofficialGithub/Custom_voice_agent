'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import uiConfig from '../../config/ui.json';
import { LayoutDashboard, Bot, Mic, FileText, Brain } from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="h-4 w-4" />,
  Bot: <Bot className="h-4 w-4" />,
  Mic: <Mic className="h-4 w-4" />,
  FileText: <FileText className="h-4 w-4" />,
  Brain: <Brain className="h-4 w-4" />,
};

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-56 shrink-0 flex-col justify-between border-r border-[var(--border)] bg-[var(--bg-elevated)] p-3 md:flex">
      <nav className="space-y-0.5">
        <p className="ui-label px-2.5 pt-1">Menu</p>
        {uiConfig.navigation.map((item) => {
          const isActive = pathname === item.href;
          const icon = ICON_MAP[item.icon] || <Bot className="h-4 w-4" />;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors ${
                isActive
                  ? 'bg-[var(--surface)] font-medium text-[var(--text)]'
                  : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
              }`}
            >
              <span className={isActive ? 'text-[var(--text)]' : 'text-[var(--text-faint)]'}>{icon}</span>
              {item.title}
            </Link>
          );
        })}
      </nav>

      <div className="rounded-md border border-[var(--border)] px-3 py-2.5">
        <p className="text-[11px] font-medium text-[var(--text)]">Axirom</p>
        <p className="mt-0.5 text-[10px] text-[var(--text-faint)]">Voice · docs · memory</p>
      </div>
    </aside>
  );
}
