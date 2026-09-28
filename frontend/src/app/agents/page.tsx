'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient, Agent } from '../../lib/api-client';
import { validateAgentName, validateSystemPrompt } from '../../lib/validator';
import { Loading, EmptyState } from '../../components/ui/loading';
import { Bot, Plus, Mic, Trash2, Edit3, FileText } from 'lucide-react';
import {
  TtsGender,
  TtsVoiceId,
  DEFAULT_VOICE_BY_GENDER,
  voicesForGender,
  genderForVoice,
} from '../../lib/tts-voices';

const TOOLS = [
  { id: 'get_time', label: 'Time' },
  { id: 'web_search', label: 'Web search' },
  { id: 'search_knowledge_base', label: 'Documents' },
] as const;

export default function AgentsPage() {
  const { apiKey, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [llmProvider, setLlmProvider] = useState<'openai' | 'claude'>('openai');
  const [llmModel, setLlmModel] = useState('gpt-4o');
  const [enabledTools, setEnabledTools] = useState<string[]>(['get_time', 'web_search', 'search_knowledge_base']);
  const [ttsGender, setTtsGender] = useState<TtsGender>('neutral');
  const [ttsVoice, setTtsVoice] = useState<TtsVoiceId>('alloy');

  useEffect(() => {
    loadAgents();
  }, [apiKey]);

  const loadAgents = async () => {
    setLoading(true);
    try {
      setAgents(await apiClient.getAgents(apiKey));
    } catch (err) {
      showError(err, 'Load Agents');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingAgent(null);
    setName('');
    setSystemPrompt('You are a helpful voice assistant. Answer clearly and concisely.');
    setLlmProvider('openai');
    setLlmModel('gpt-4o');
    setEnabledTools(['get_time', 'web_search', 'search_knowledge_base']);
    setTtsGender('neutral');
    setTtsVoice('alloy');
    setShowModal(true);
  };

  const openEditModal = (agent: Agent) => {
    setEditingAgent(agent);
    setName(agent.name);
    setSystemPrompt(agent.systemPrompt);
    setLlmProvider((agent.llmProvider as 'openai' | 'claude') || 'openai');
    setLlmModel(agent.llmModel || 'gpt-4o');
    setEnabledTools(agent.enabledTools || []);
    const voice = (agent.ttsVoice as TtsVoiceId) || 'alloy';
    setTtsVoice(voice);
    setTtsGender((agent.ttsGender as TtsGender) || genderForVoice(voice));
    setShowModal(true);
  };

  const handleSave = async () => {
    const nameVal = validateAgentName(name);
    if (!nameVal.isValid) {
      showError(nameVal.error, 'Validation');
      return;
    }
    const promptVal = validateSystemPrompt(systemPrompt);
    if (!promptVal.isValid) {
      showError(promptVal.error, 'Validation');
      return;
    }

    const agentData = {
      name: nameVal.sanitizedValue,
      systemPrompt: promptVal.sanitizedValue,
      llmProvider,
      llmModel,
      enabledTools,
      ttsVoice,
      ttsGender,
    };

    try {
      if (editingAgent) {
        await apiClient.updateAgent(editingAgent.id, agentData, apiKey);
        showSuccess('Updated', agentData.name);
      } else {
        await apiClient.createAgent(agentData, apiKey);
        showSuccess('Created', agentData.name);
      }
      setShowModal(false);
      loadAgents();
    } catch (err) {
      showError(err, editingAgent ? 'Update' : 'Create');
    }
  };

  const handleDelete = async (agent: Agent) => {
    if (!hasPermission('manage_agents')) {
      showError('Admin or developer role required.', 'Permission');
      return;
    }
    if (!confirm(`Delete “${agent.name}”? Chats and documents for this agent will be removed.`)) return;
    try {
      await apiClient.deleteAgent(agent.id, apiKey);
      showSuccess('Deleted', agent.name);
      loadAgents();
    } catch (err) {
      showError(err, 'Delete');
    }
  };

  const toggleTool = (tool: string) => {
    setEnabledTools((prev) => (prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]));
  };

  return (
    <div className="ui-page space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="ui-title">Agents</h1>
          <p className="ui-subtitle">Persona, model, voice, and tools for each agent.</p>
        </div>
        <button type="button" onClick={openCreateModal} className="ui-btn ui-btn-primary self-start">
          <Plus className="h-3.5 w-3.5" />
          New agent
        </button>
      </div>

      {loading ? (
        <Loading label="Loading agents" />
      ) : agents.length === 0 ? (
        <EmptyState title="No agents" body="Create an agent, then upload docs and open chat." />
      ) : (
        <ul className="divide-y divide-[var(--border)] rounded-lg border border-[var(--border)]">
          {agents.map((agent) => (
            <li key={agent.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[var(--text-faint)]" />
                  <h3 className="truncate text-sm font-semibold text-[var(--text)]">{agent.name}</h3>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--text-muted)]">{agent.systemPrompt}</p>
                <p className="mt-2 font-mono text-[10px] text-[var(--text-faint)]">
                  {agent.llmProvider}/{agent.llmModel} · {agent.ttsVoice || 'alloy'} ·{' '}
                  {(agent.enabledTools || []).join(', ') || 'no tools'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Link href={`/playground?agentId=${agent.id}`} className="ui-btn ui-btn-ghost" title="Chat">
                  <Mic className="h-3.5 w-3.5" />
                </Link>
                <Link href={`/documents?agentId=${agent.id}`} className="ui-btn ui-btn-ghost" title="Documents">
                  <FileText className="h-3.5 w-3.5" />
                </Link>
                <button type="button" onClick={() => openEditModal(agent)} className="ui-btn ui-btn-ghost" title="Edit">
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => handleDelete(agent)} className="ui-btn ui-btn-ghost text-[var(--danger)]" title="Delete">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-3">
              <h3 className="text-sm font-semibold">{editingAgent ? 'Edit agent' : 'New agent'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="text-xs text-[var(--text-muted)] hover:text-[var(--text)]">
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="ui-label">Name</label>
                <input className="ui-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Support agent" />
              </div>
              <div>
                <label className="ui-label">System prompt</label>
                <textarea
                  rows={4}
                  className="ui-input resize-y"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ui-label">Provider</label>
                  <select
                    className="ui-input"
                    value={llmProvider}
                    onChange={(e) => {
                      const p = e.target.value as 'openai' | 'claude';
                      setLlmProvider(p);
                      setLlmModel(p === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-5');
                    }}
                  >
                    <option value="openai">OpenAI</option>
                    <option value="claude">Claude</option>
                  </select>
                </div>
                <div>
                  <label className="ui-label">Model</label>
                  <input className="ui-input" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="ui-label">Voice gender</label>
                  <select
                    className="ui-input"
                    value={ttsGender}
                    onChange={(e) => {
                      const g = e.target.value as TtsGender;
                      setTtsGender(g);
                      const opts = voicesForGender(g);
                      if (!opts.some((v) => v.id === ttsVoice)) setTtsVoice(DEFAULT_VOICE_BY_GENDER[g]);
                    }}
                  >
                    <option value="neutral">Neutral</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
                <div>
                  <label className="ui-label">TTS voice</label>
                  <select
                    className="ui-input"
                    value={ttsVoice}
                    onChange={(e) => {
                      const v = e.target.value as TtsVoiceId;
                      setTtsVoice(v);
                      setTtsGender(genderForVoice(v));
                    }}
                  >
                    {voicesForGender(ttsGender).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="ui-label">Tools</label>
                <div className="flex flex-wrap gap-2">
                  {TOOLS.map((t) => {
                    const on = enabledTools.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => toggleTool(t.id)}
                        className={`rounded-md border px-3 py-1.5 text-xs ${
                          on
                            ? 'border-[var(--border-strong)] bg-[var(--bg)] text-[var(--text)]'
                            : 'border-[var(--border)] text-[var(--text-muted)]'
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-[var(--border)] pt-4">
              <button type="button" onClick={() => setShowModal(false)} className="ui-btn ui-btn-ghost">
                Cancel
              </button>
              <button type="button" onClick={handleSave} className="ui-btn ui-btn-primary">
                {editingAgent ? 'Save' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
