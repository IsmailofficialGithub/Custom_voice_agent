'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient, Agent } from '../../lib/api-client';
import { validateAgentName, validateSystemPrompt } from '../../lib/validator';
import { Bot, Plus, Mic, Trash2, Edit3, Sparkles, Clock, Globe, Database, Check, FileText } from 'lucide-react';
import {
  TtsGender,
  TtsVoiceId,
  DEFAULT_VOICE_BY_GENDER,
  voicesForGender,
  genderForVoice,
} from '../../lib/tts-voices';

export default function AgentsPage() {
  const { apiKey, hasPermission } = useAuth();
  const { showSuccess, showError } = useToast();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<Agent | null>(null);

  // Form Fields
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
      const list = await apiClient.getAgents(apiKey);
      setAgents(list);
    } catch (err) {
      showError(err, 'Load Agents');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditingAgent(null);
    setName('');
    setSystemPrompt('You are a helpful AI voice assistant for our organization. Answer questions clearly and concisely.');
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
    // Validate inputs
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
        showSuccess('Agent Updated', `Successfully updated agent "${nameVal.sanitizedValue}".`);
      } else {
        await apiClient.createAgent(agentData, apiKey);
        showSuccess('Agent Created', `Successfully deployed agent "${nameVal.sanitizedValue}".`);
      }
      setShowModal(false);
      loadAgents();
    } catch (err) {
      showError(err, editingAgent ? 'Update Agent' : 'Create Agent');
    }
  };

  const handleDelete = async (agent: Agent) => {
    if (!hasPermission('manage_agents')) {
      showError('Permission denied. Admin or Developer role required to delete agents.', 'Access Control');
      return;
    }

    if (confirm(`Are you sure you want to delete agent "${agent.name}"? This will cascade-delete all conversations and documents associated with this agent.`)) {
      try {
        await apiClient.deleteAgent(agent.id, apiKey);
        showSuccess('Agent Deleted', `Agent "${agent.name}" was removed.`);
        loadAgents();
      } catch (err) {
        showError(err, 'Delete Agent');
      }
    }
  };

  const toggleTool = (tool: string) => {
    setEnabledTools((prev) => (prev.includes(tool) ? prev.filter((t) => t !== tool) : [...prev, tool]));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-100 flex items-center gap-2">
            <Bot className="w-6 h-6 text-purple-400" />
            <span>Agent Studio</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">Configure persona rules, select LLM providers, and toggle tools for autonomous voice agents.</p>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-purple-500/25 transition-all hover:scale-105 self-start"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Agent</span>
        </button>
      </div>

      {/* Agent Grid */}
      {loading ? (
        <div className="glass-panel p-12 rounded-2xl text-center text-slate-400 text-xs">Loading agents...</div>
      ) : agents.length === 0 ? (
        <div className="glass-panel p-12 rounded-2xl text-center space-y-3 border-dashed border-slate-700">
          <Bot className="w-12 h-12 text-slate-500 mx-auto" />
          <div className="text-base font-bold text-slate-200">No voice agents found</div>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">Create an agent to start testing real-time voice sessions.</p>
          <button onClick={openCreateModal} className="px-4 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold">
            Create Agent
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map((agent) => (
            <div key={agent.id} className="glass-panel glass-panel-hover p-6 rounded-2xl flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-base text-slate-100">{agent.name}</h3>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {agent.id.substring(0, 8)}...</div>
                  </div>
                  <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {agent.llmProvider}
                  </span>
                </div>

                <p className="text-xs text-slate-300 leading-relaxed line-clamp-3 bg-slate-900/60 p-3 rounded-xl border border-white/5">
                  {agent.systemPrompt}
                </p>

                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <span className="rounded-md border border-slate-700 bg-slate-900/80 px-2 py-0.5 text-slate-300">
                    Voice: {agent.ttsVoice || 'alloy'}
                  </span>
                  <span className="rounded-md border border-slate-700 bg-slate-900/80 px-2 py-0.5 capitalize text-slate-300">
                    {agent.ttsGender || 'neutral'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Enabled Tools</div>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.enabledTools.includes('get_time') && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                        <Clock className="w-3 h-3" />
                        <span>get_time</span>
                      </span>
                    )}
                    {agent.enabledTools.includes('web_search') && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-sky-500/15 text-sky-300 border border-sky-500/30">
                        <Globe className="w-3 h-3" />
                        <span>web_search</span>
                      </span>
                    )}
                    {agent.enabledTools.includes('search_knowledge_base') && (
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-300 border border-purple-500/30">
                        <Database className="w-3 h-3" />
                        <span>RAG Docs</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-2">
                <Link
                  href={`/playground?agentId=${agent.id}`}
                  className="flex-1 py-2 px-3 rounded-xl bg-purple-600/30 hover:bg-purple-600 text-purple-200 hover:text-white text-xs font-bold text-center transition-all flex items-center justify-center gap-1.5"
                >
                  <Mic className="w-3.5 h-3.5" />
                  <span>Test Voice</span>
                </Link>

                <Link
                  href={`/documents?agentId=${agent.id}`}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Manage documents"
                >
                  <FileText className="w-4 h-4" />
                </Link>

                <button
                  onClick={() => openEditModal(agent)}
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  title="Edit Agent"
                >
                  <Edit3 className="w-4 h-4" />
                </button>

                <button
                  onClick={() => handleDelete(agent)}
                  className="p-2 rounded-xl bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 transition-colors"
                  title="Delete Agent"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="glass-panel w-full max-w-xl rounded-3xl p-6 sm:p-8 shadow-2xl border border-white/15 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="font-bold text-lg text-slate-100">{editingAgent ? 'Edit Agent Persona' : 'Deploy New Voice Agent'}</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white text-lg">
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">Agent Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-medium focus:outline-none focus:border-purple-500"
                  placeholder="e.g. Finance Advisor Pro"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">System Persona & Prompt *</label>
                <textarea
                  rows={4}
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-medium focus:outline-none focus:border-purple-500 leading-relaxed"
                  placeholder="Describe the agent's role, rules, tone, and guidelines..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">LLM Engine Provider</label>
                  <select
                    value={llmProvider}
                    onChange={(e) => {
                      const prov = e.target.value as 'openai' | 'claude';
                      setLlmProvider(prov);
                      setLlmModel(prov === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-5');
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-medium focus:outline-none focus:border-purple-500"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="claude">Anthropic Claude</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Model Name</label>
                  <input
                    type="text"
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-medium focus:outline-none focus:border-purple-500"
                    placeholder="gpt-4o"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">Voice gender</label>
                  <select
                    value={ttsGender}
                    onChange={(e) => {
                      const g = e.target.value as TtsGender;
                      setTtsGender(g);
                      const options = voicesForGender(g);
                      if (!options.some((v) => v.id === ttsVoice)) {
                        setTtsVoice(DEFAULT_VOICE_BY_GENDER[g]);
                      }
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-medium focus:outline-none focus:border-purple-500"
                  >
                    <option value="neutral">Neutral</option>
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">TTS voice</label>
                  <select
                    value={ttsVoice}
                    onChange={(e) => {
                      const v = e.target.value as TtsVoiceId;
                      setTtsVoice(v);
                      setTtsGender(genderForVoice(v));
                    }}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs font-medium focus:outline-none focus:border-purple-500"
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
                <label className="block text-xs font-bold text-slate-300 mb-2">Enable Capabilities & Tools</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleTool('get_time')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                      enabledTools.includes('get_time') ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-emerald-400" />
                      <span className="text-xs font-bold">get_time</span>
                    </div>
                    {enabledTools.includes('get_time') && <Check className="w-4 h-4 text-emerald-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleTool('web_search')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                      enabledTools.includes('web_search') ? 'bg-sky-950/40 border-sky-500/50 text-sky-200' : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-sky-400" />
                      <span className="text-xs font-bold">web_search</span>
                    </div>
                    {enabledTools.includes('web_search') && <Check className="w-4 h-4 text-sky-400" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleTool('search_knowledge_base')}
                    className={`p-3 rounded-xl border text-left transition-all flex items-center justify-between ${
                      enabledTools.includes('search_knowledge_base')
                        ? 'bg-purple-950/40 border-purple-500/50 text-purple-200'
                        : 'bg-slate-900 border-slate-800 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Database className="w-4 h-4 text-purple-400" />
                      <span className="text-xs font-bold">RAG Docs</span>
                    </div>
                    {enabledTools.includes('search_knowledge_base') && <Check className="w-4 h-4 text-purple-400" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-bold shadow-lg shadow-purple-500/25"
              >
                {editingAgent ? 'Save Changes' : 'Deploy Agent'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
