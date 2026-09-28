'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../context/auth-context';
import { useToast } from '../context/toast-context';
import { apiClient, Agent } from '../lib/api-client';
import companyConfig from '../config/company.json';
import { Bot, Mic, FileText, Brain, Sparkles, Activity, Plus, ArrowRight, ShieldCheck, Zap } from 'lucide-react';

export default function DashboardPage() {
  const { apiKey, currentUser } = useAuth();
  const { showError } = useToast();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState<string>('Online');

  useEffect(() => {
    loadDashboardData();
  }, [apiKey]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const fetchedAgents = await apiClient.getAgents(apiKey);
      setAgents(fetchedAgents);
      setHealthStatus('Online');
    } catch (err) {
      setHealthStatus('Offline');
      showError(err, 'Dashboard Loading');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Hero Welcome Banner */}
      <div className="glass-panel p-8 rounded-3xl relative overflow-hidden border border-purple-500/20 bg-gradient-to-r from-purple-950/40 via-slate-900/60 to-indigo-950/40">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-semibold border border-purple-500/30 mb-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              <span>{companyConfig.version} Autonomous Engine</span>
            </div>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight text-white">
              Welcome back, <span className="gradient-text">{currentUser.name}</span>
            </h1>
            <p className="text-slate-300 text-sm max-w-xl leading-relaxed">
              Manage your real-time voice agents, upload knowledge base PDFs to pgvector, inspect long-term memories, and test WebSocket streaming.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/agents"
              className="px-5 py-3 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-purple-500/25 transition-all hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Agent</span>
            </Link>
            <Link
              href="/documents"
              className="px-5 py-3 rounded-2xl glass-panel hover:bg-white/10 text-slate-200 font-semibold text-xs flex items-center gap-2 transition-all hover:scale-105"
            >
              <FileText className="w-4 h-4 text-purple-400" />
              <span>Upload Docs</span>
            </Link>
            <Link
              href="/playground"
              className="px-5 py-3 rounded-2xl glass-panel hover:bg-white/10 text-slate-200 font-semibold text-xs flex items-center gap-2 transition-all hover:scale-105"
            >
              <Mic className="w-4 h-4 text-purple-400" />
              <span>Voice Playground</span>
            </Link>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <div className="glass-panel p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Active Agents</div>
            <div className="text-3xl font-black text-slate-100 mt-1">{loading ? '...' : agents.length}</div>
          </div>
          <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
            <Bot className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">LLM Engine</div>
            <div className="text-sm font-bold text-slate-200 mt-2 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-amber-400" />
              <span>OpenAI & Claude</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">RAG Vector Store</div>
            <div className="text-sm font-bold text-slate-200 mt-2 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Postgres pgvector</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <FileText className="w-6 h-6" />
          </div>
        </div>

        <div className="glass-panel p-5 rounded-2xl flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">System Health</div>
            <div className="text-sm font-bold text-emerald-400 mt-2 flex items-center gap-1.5">
              <Activity className="w-4 h-4 animate-pulse" />
              <span>{healthStatus}</span>
            </div>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Activity className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Agents Quick List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <Bot className="w-5 h-5 text-purple-400" />
            <span>Deployed Voice Agents</span>
          </h2>
          <Link href="/agents" className="text-xs font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1">
            <span>Manage All ({agents.length})</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="glass-panel p-8 rounded-2xl text-center text-slate-400 text-xs">Loading agents...</div>
        ) : agents.length === 0 ? (
          <div className="glass-panel p-10 rounded-2xl text-center space-y-3 border-dashed border-slate-700">
            <Bot className="w-10 h-10 text-slate-500 mx-auto" />
            <div className="text-sm font-bold text-slate-300">No agents deployed yet</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Create your first voice agent with custom system persona and enabled tools.
            </p>
            <Link
              href="/agents"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Create Agent</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {agents.map((agent) => (
              <div key={agent.id} className="glass-panel glass-panel-hover p-5 rounded-2xl space-y-3 flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-base text-slate-100">{agent.name}</h3>
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {agent.llmProvider}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 mt-2 leading-relaxed">{agent.systemPrompt}</p>
                </div>

                <div className="pt-3 border-t border-white/5 space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {agent.enabledTools.map((t) => (
                      <span key={t} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                        {t}
                      </span>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Link
                      href={`/playground?agentId=${agent.id}`}
                      className="w-full py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white text-xs font-bold text-center transition-all flex items-center justify-center gap-1.5"
                    >
                      <Mic className="w-3.5 h-3.5" />
                      <span>Start Voice Session</span>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
