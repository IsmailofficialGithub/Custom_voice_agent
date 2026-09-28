'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient, Agent } from '../../lib/api-client';
import { Loading, EmptyState } from '../../components/ui/loading';

export default function MemoryPage() {
  const { apiKey } = useAuth();
  const { showError } = useToast();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAgents();
  }, [apiKey]);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const list = await apiClient.getAgents(apiKey);
      setAgents(list);
      if (list.length > 0) setSelectedAgentId(list[0].id);
    } catch (err) {
      showError(err, 'Memory');
    } finally {
      setLoading(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="ui-page space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="ui-title">Memory</h1>
          <p className="ui-subtitle">
            Short-term chat window plus long-term facts stored when a session ends.
          </p>
        </div>
        <select
          className="ui-input max-w-xs"
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <Loading label="Loading" />
      ) : !selectedAgent ? (
        <EmptyState title="No agents" body="Create an agent first." />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">Short-term</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
                Last ~20 messages stay in the prompt for the current chat.
              </p>
            </div>
            <div className="rounded-lg border border-[var(--border)] p-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">Long-term</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-muted)]">
                When you close a chat, facts are embedded and stored for later recall.
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-[var(--border)] p-4">
            <h3 className="text-sm font-semibold text-[var(--text)]">{selectedAgent.name}</h3>
            <p className="mt-1 font-mono text-[11px] text-[var(--text-faint)]">{selectedAgent.id}</p>
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              Memory entries are created automatically after sessions. Use chat to build history, then
              close the chat to store summaries.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
