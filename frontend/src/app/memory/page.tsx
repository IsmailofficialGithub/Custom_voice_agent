'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient, Agent } from '../../lib/api-client';
import { Brain, Bot, Sparkles, RefreshCw, CheckCircle } from 'lucide-react';

export default function MemoryPage() {
  const { apiKey } = useAuth();
  const { showError } = useToast();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
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
      showError(err, 'Load Memory');
    } finally {
      setLoading(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            <span>Memory Vault & Vector Summaries</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Inspect cross-session long-term memory facts stored in pgvector for autonomous recall.</p>
        </div>

        {/* Agent Selector */}
        <select
          value={selectedAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-200 text-xs font-semibold focus:outline-none focus:border-purple-500"
        >
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.llmProvider})
            </option>
          ))}
        </select>
      </div>

      {/* Memory Architecture Info Box */}
      <div className="glass-panel p-6 rounded-3xl border border-purple-500/20 bg-purple-950/20 space-y-4">
        <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span>Multi-Tiered Memory System Architecture</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
            <div className="font-bold text-slate-200 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-400" />
              <span>1. Short-Term Memory Window</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              Rolling window of the last 20 messages included in every system prompt for immediate conversation context.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
            <div className="font-bold text-slate-200 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-purple-400" />
              <span>2. Long-Term Vector Summaries</span>
            </div>
            <p className="text-slate-400 leading-relaxed">
              When a session ends, the orchestrator extracts user facts, embeds them via OpenAI, and stores them in PostgreSQL <code className="text-purple-300">memories</code> table for top-3 similarity recall.
            </p>
          </div>
        </div>
      </div>

      {/* Agent Active Memory Details */}
      {selectedAgent && (
        <div className="glass-panel p-6 rounded-3xl space-y-4 border border-white/10">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div>
              <h3 className="font-bold text-base text-slate-100">{selectedAgent.name}</h3>
              <div className="text-xs text-slate-400">Target Agent ID: {selectedAgent.id}</div>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30">
              {selectedAgent.llmProvider.toUpperCase()}
            </span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2">
            <div className="text-xs font-bold text-slate-300">System Persona Baseline:</div>
            <div className="text-xs text-slate-400 leading-relaxed font-mono">{selectedAgent.systemPrompt}</div>
          </div>
        </div>
      )}
    </div>
  );
}
