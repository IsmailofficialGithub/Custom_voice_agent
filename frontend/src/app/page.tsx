'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { apiClient, Agent } from '../lib/api-client';
import companyConfig from '../config/company.json';
import { Loading, EmptyState } from '../components/ui/loading';
import { Bot, Mic, FileText, Plus, Phone, Activity, ArrowUpRight, Radio } from 'lucide-react';

export default function DashboardPage() {
  const { apiKey, currentUser } = useAuth();
  const { showError } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, [apiKey]);

  const loadDashboardData = async () => {
    if (!apiKey) return;
    setLoading(true);
    try {
      setAgents(await apiClient.getAgents(apiKey));
      setOnline(true);
    } catch (err) {
      setOnline(false);
      showError(err, 'Dashboard');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ui-page space-y-7">
      {/* Top Banner */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-7 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-muted)]">
            <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="font-medium text-[var(--text)]">{online ? 'Service Online' : 'Service Disconnected'}</span>
            <span>·</span>
            <span className="font-mono text-[11px]">v{companyConfig.version}</span>
          </div>

          <div className="text-xs text-[var(--text-muted)]">
            Workspace: <span className="font-medium text-[var(--text)]">{companyConfig.name}</span>
          </div>
        </div>

        <div className="mt-4">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text)]">
            Overview
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)] max-w-xl">
            Manage your conversational voice agents, knowledge base, and live audio sessions.
          </p>
        </div>

        <div className="mt-5 flex flex-wrap gap-2.5">
          <Link href="/agents" className="ui-btn ui-btn-primary">
            <Plus className="h-4 w-4" />
            Create Agent
          </Link>
          <Link href="/playground" className="ui-btn ui-btn-ghost">
            <Mic className="h-4 w-4 text-[var(--accent)]" />
            Live Chat
          </Link>
          <Link href="/documents" className="ui-btn ui-btn-ghost">
            <FileText className="h-4 w-4" />
            Documents
          </Link>
        </div>
      </section>

      {/* Real Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Configured Agents</span>
            <Bot className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--text)]">{agents.length}</div>
          <div className="mt-1 text-[11px] text-[var(--text-faint)]">Total voice agents ready</div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Connection</span>
            <Activity className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--text)]">{online ? 'Healthy' : 'Offline'}</div>
          <div className="mt-1 text-[11px] text-[var(--text-faint)]">Backend health status</div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Active Session</span>
            <Radio className="h-4 w-4 text-[var(--text-muted)]" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--text)] truncate capitalize">{currentUser.role}</div>
          <div className="mt-1 text-[11px] text-[var(--text-faint)] truncate">{currentUser.email || currentUser.name}</div>
        </div>
      </div>

      {/* Agents List Section */}
      <section className="space-y-3.5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text)]">Voice Agents ({agents.length})</h2>
          <Link href="/agents" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">
            <span>Manage all</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <Loading label="Loading agents…" />
        ) : agents.length === 0 ? (
          <EmptyState title="No agents configured" body="Create a new voice agent to start handling incoming calls and conversations." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {agents.slice(0, 6).map((agent) => (
              <div
                key={agent.id}
                className="flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 transition-all duration-150 hover:border-[var(--border-strong)]"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] text-[var(--text-muted)]">
                    <Bot className="h-4.5 w-4.5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-[var(--text)]">
                      {agent.name}
                    </h3>
                    <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                      {agent.llmProvider} · voice: {agent.ttsVoice || 'alloy'}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-[var(--border)]">
                  <span className="text-[11px] text-[var(--text-faint)] font-mono">
                    {agent.id.slice(0, 8)}…
                  </span>

                  <Link
                    href={`/playground?agentId=${agent.id}&startCall=true`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 active:scale-95 transition-all"
                  >
                    <Phone className="h-3 w-3 fill-current" />
                    <span>Start Call</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
