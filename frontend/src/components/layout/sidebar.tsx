'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import uiConfig from '../../config/ui.json';
import { LayoutDashboard, Bot, Mic, FileText, Brain, Users, X, LogOut } from 'lucide-react';

const ICON_MAP: Record<string, React.ReactNode> = {
  LayoutDashboard: <LayoutDashboard className="h-4 w-4" />,
  Bot: <Bot className="h-4 w-4" />,
  Mic: <Mic className="h-4 w-4" />,
  Users: <Users className="h-4 w-4" />,
  FileText: <FileText className="h-4 w-4" />,
  Brain: <Brain className="h-4 w-4" />,
};

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { currentUser, logout } = useAuth();

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col justify-between border-r border-[var(--border)] bg-[var(--bg-elevated)] p-4 transition-transform duration-200 ease-in-out md:static md:w-56 md:translate-x-0 md:p-3 overflow-y-auto ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between md:hidden">
            <span className="text-sm font-semibold text-[var(--text)]">Navigation</span>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <nav className="space-y-0.5">
            <p className="ui-label px-2.5 pt-1">Menu</p>
            {uiConfig.navigation.map((item) => {
              const isActive = pathname === item.href;
              const icon = ICON_MAP[item.icon] || <Bot className="h-4 w-4" />;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--surface)] text-[var(--text)] shadow-xs'
                      : 'text-[var(--text-muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
                  }`}
                >
                  <span className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-faint)]'}>{icon}</span>
                  {item.title}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Card & Logout pinned to bottom of the 100vh sidebar */}
        <div className="space-y-2 border-t border-[var(--border)] pt-3 mt-auto shrink-0">
          <div className="flex items-center gap-2.5 px-2 py-1">
            <img
              src={currentUser.avatar}
              alt=""
              className="h-8 w-8 rounded-lg bg-[var(--surface)] border border-[var(--border)] shrink-0"
            />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-[var(--text)]">{currentUser.name}</div>
              <div className="truncate text-[10px] text-[var(--text-muted)] capitalize">{currentUser.role}</div>
            </div>
          </div>

          <button
            type="button"
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
