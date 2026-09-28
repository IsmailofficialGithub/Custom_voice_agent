'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { apiClient, Agent } from '../lib/api-client';
import companyConfig from '../config/company.json';
import { Loading, EmptyState } from '../components/ui/loading';
import { Bot, Mic, FileText, ArrowRight, Plus } from 'lucide-react';

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
      <section className="border-b border-[var(--border)] pb-8">
        <p className="text-xs text-[var(--text-muted)]">
          {online ? 'Backend online' : 'Backend offline'} · {companyConfig.version}
        </p>
        <h1 className="ui-title mt-2">Hello, {currentUser.name}</h1>
        <p className="ui-subtitle max-w-lg">
          Create agents, attach documents, and talk in chat. Same look everywhere — no fluff.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link href="/agents" className="ui-btn ui-btn-primary">
            <Plus className="h-3.5 w-3.5" />
            New agent
          </Link>
          <Link href="/documents" className="ui-btn ui-btn-ghost">
            <FileText className="h-3.5 w-3.5" />
            Documents
          </Link>
          <Link href="/playground" className="ui-btn ui-btn-ghost">
            <Mic className="h-3.5 w-3.5" />
            Chat
          </Link>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--text)]">Agents</h2>
          <Link href="/agents" className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
            View all
          </Link>
        </div>

        {loading ? (
          <Loading label="Loading agents" />
        ) : agents.length === 0 ? (
          <EmptyState title="No agents yet" body="Create one to start voice and document chats." />
        ) : (
          <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
            {agents.slice(0, 6).map((agent) => (
              <li key={agent.id} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[var(--surface)]">
                <div className="flex min-w-0 items-center gap-3">
                  <Bot className="h-4 w-4 shrink-0 text-[var(--text-faint)]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--text)]">{agent.name}</p>
                    <p className="truncate text-xs text-[var(--text-muted)]">
                      {agent.llmProvider} · {agent.ttsVoice || 'alloy'}
                    </p>
                  </div>
                </div>
                <Link
                  href={`/playground?agentId=${agent.id}`}
                  className="inline-flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text)]"
                >
                  Open <ArrowRight className="h-3 w-3" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
