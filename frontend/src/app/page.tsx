'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { apiClient, Agent } from '../lib/api-client';
import companyConfig from '../config/company.json';
import { Loading, EmptyState } from '../components/ui/loading';
import { Bot, Mic, FileText, Plus, Phone, Sparkles, Activity, ShieldCheck, ArrowUpRight } from 'lucide-react';

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
    <div className="ui-page space-y-8">
      {/* Hero Welcome Banner */}
      <section className="relative overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8 shadow-sm">
        <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative z-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg)] px-3 py-1 text-xs text-[var(--text-muted)]">
              <span className={`h-2 w-2 rounded-full ${online ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className="font-medium text-[var(--text)]">{online ? 'System operational' : 'Offline'}</span>
              <span>·</span>
              <span>v{companyConfig.version}</span>
            </div>

            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <ShieldCheck className="h-4 w-4 text-[var(--ok)]" />
              <span>Role: <strong className="text-[var(--text)] capitalize">{currentUser.role}</strong></span>
            </div>
          </div>

          <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text)]">
            Welcome, {currentUser.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)] max-w-xl leading-relaxed">
            Configure intelligent voice agents, upload knowledge documents, and orchestrate realtime conversations with seamless synthesis.
          </p>

          <div className="mt-6 flex flex-wrap gap-2.5">
            <Link href="/agents" className="ui-btn ui-btn-primary">
              <Plus className="h-4 w-4" />
              Create Agent
            </Link>
            <Link href="/playground" className="ui-btn ui-btn-ghost">
              <Mic className="h-4 w-4 text-indigo-500" />
              Voice Playground
            </Link>
            <Link href="/documents" className="ui-btn ui-btn-ghost">
              <FileText className="h-4 w-4 text-sky-500" />
              Knowledge Base
            </Link>
          </div>
        </div>
      </section>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Configured Agents</span>
            <Bot className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--text)]">{agents.length}</div>
          <div className="mt-1 text-[11px] text-[var(--text-faint)]">Active & ready for dispatch</div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Voice Models</span>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--text)]">OpenAI & ElevenLabs</div>
          <div className="mt-1 text-[11px] text-[var(--text-faint)]">Low-latency audio streaming</div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span>Server Health</span>
            <Activity className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-bold text-[var(--text)]">{online ? 'Optimal' : 'Degraded'}</div>
          <div className="mt-1 text-[11px] text-[var(--text-faint)]">Realtime WebSocket pipeline</div>
        </div>
      </div>

      {/* Agents List Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--text)]">Your Voice Agents</h2>
            <p className="text-xs text-[var(--text-muted)]">Select an agent to test call or configure</p>
          </div>
          <Link href="/agents" className="inline-flex items-center gap-1 text-xs font-medium text-[var(--accent)] hover:underline">
            <span>View all</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {loading ? (
          <Loading label="Loading agents" />
        ) : agents.length === 0 ? (
          <EmptyState title="No agents yet" body="Create your first voice agent to start running calls and workflows." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {agents.slice(0, 6).map((agent) => (
              <div
                key={agent.id}
                className="group relative flex flex-col justify-between rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4.5 transition-all duration-150 hover:border-[var(--border-strong)] hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--bg)] text-indigo-500">
                      <Bot className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">
                        {agent.name}
                      </h3>
                      <p className="mt-0.5 truncate text-xs text-[var(--text-muted)]">
                        Provider: {agent.llmProvider} · Voice: {agent.ttsVoice || 'alloy'}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between pt-3 border-t border-[var(--border)]">
                  <span className="text-[11px] text-[var(--text-faint)] font-mono">
                    ID: {agent.id.slice(0, 8)}…
                  </span>

                  <Link
                    href={`/playground?agentId=${agent.id}&startCall=true`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:opacity-90 active:scale-95 transition-all"
                  >
                    <Phone className="h-3 w-3 fill-current" />
                    <span>Call Now</span>
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
