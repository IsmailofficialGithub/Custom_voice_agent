'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient, Agent, Conversation } from '../../lib/api-client';
import dynamic from 'next/dynamic';
const ChatWorkspace = dynamic(
  () => import('../../components/audio/chat-workspace').then((m) => m.ChatWorkspace),
  { ssr: false }
);
import {
  PanelLeft,
  SquarePen,
  Trash2,
  X,
  Bot,
  LayoutDashboard,
  FileText,
  Plus,
  Mic,
} from 'lucide-react';
import {
  TtsGender,
  TtsVoiceId,
  DEFAULT_VOICE_BY_GENDER,
  voicesForGender,
  genderForVoice,
} from '../../lib/tts-voices';

function PlaygroundContent() {
  const { apiKey } = useAuth();
  const { showError, showSuccess } = useToast();
  const searchParams = useSearchParams();
  const initialAgentId = searchParams.get('agentId');

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState(initialAgentId || '');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [loadingChats, setLoadingChats] = useState(false);
  const [creating, setCreating] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showNewChatModal, setShowNewChatModal] = useState(false);
  const [newChatName, setNewChatName] = useState('');
  const [newChatContext, setNewChatContext] = useState('');
  const [newChatGender, setNewChatGender] = useState<TtsGender | ''>('');
  const [newChatVoice, setNewChatVoice] = useState<TtsVoiceId | ''>('');

  // Agent creation state
  const [showCreateAgentModal, setShowCreateAgentModal] = useState(false);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentPrompt, setNewAgentPrompt] = useState('You are a helpful voice assistant. Answer clearly and concisely.');
  const [newAgentProvider, setNewAgentProvider] = useState<'openai' | 'claude'>('openai');
  const [newAgentModel, setNewAgentModel] = useState('gpt-4o');
  const [newAgentVoice, setNewAgentVoice] = useState<TtsVoiceId>('alloy');
  const [newAgentGender, setNewAgentGender] = useState<TtsGender>('neutral');
  const [newAgentTools, setNewAgentTools] = useState<string[]>(['get_time', 'web_search']);
  const [newAgentStartPhrase, setNewAgentStartPhrase] = useState('hey boss');
  const [newAgentEndPhrase, setNewAgentEndPhrase] = useState('goodbye');
  const [newAgentFarewellMessage, setNewAgentFarewellMessage] = useState('Goodbye! Talk to you soon.');

  const openCreateAgentModal = () => {
    setNewAgentName('');
    setNewAgentPrompt('You are a helpful voice assistant. Answer clearly and concisely.');
    setNewAgentProvider('openai');
    setNewAgentModel('gpt-4o');
    setNewAgentVoice('alloy');
    setNewAgentGender('neutral');
    setNewAgentTools(['get_time', 'web_search']);
    setNewAgentStartPhrase('hey boss');
    setNewAgentEndPhrase('goodbye');
    setNewAgentFarewellMessage('Goodbye! Talk to you soon.');
    setShowCreateAgentModal(true);
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newAgentName.trim();
    if (!name) {
      showError('Please enter an agent name.', 'Create Agent');
      return;
    }
    setCreatingAgent(true);
    try {
      const created = await apiClient.createAgent(
        {
          name,
          systemPrompt: newAgentPrompt.trim() || 'You are a helpful voice assistant. Answer clearly and concisely.',
          llmProvider: newAgentProvider,
          llmModel: newAgentModel,
          ttsVoice: newAgentVoice,
          ttsGender: newAgentGender,
          enabledTools: newAgentTools,
          startPhrase: newAgentStartPhrase.trim() || 'hey boss',
          endPhrase: newAgentEndPhrase.trim() || 'goodbye',
          farewellMessage: newAgentFarewellMessage.trim() || 'Goodbye! Talk to you soon.',
        },
        apiKey
      );
      showSuccess('Agent created', `Created ${created.name}`);
      setAgents((prev) => [created, ...prev]);
      setSelectedAgentId(created.id);
      setShowCreateAgentModal(false);
    } catch (err) {
      showError(err, 'Create Agent');
    } finally {
      setCreatingAgent(false);
    }
  };

  useEffect(() => {
    loadAgents();
  }, [apiKey]);

  useEffect(() => {
    if (selectedAgentId) {
      loadConversations(selectedAgentId);
      setActiveConversation(null);
    } else {
      setConversations([]);
    }
  }, [selectedAgentId, apiKey]);

  const loadAgents = async () => {
    if (!apiKey) return;
    try {
      const list = await apiClient.getAgents(apiKey);
      setAgents(list);
      if (!selectedAgentId && list.length > 0) setSelectedAgentId(list[0].id);
    } catch (err) {
      showError(err, 'Load Agents');
    }
  };

  const loadConversations = async (agentId: string) => {
    try {
      setLoadingChats(true);
      setConversations(await apiClient.getConversations(agentId, apiKey));
    } catch (err) {
      showError(err, 'Load Chats');
    } finally {
      setLoadingChats(false);
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  const openNewChatModal = () => {
    if (!selectedAgentId) {
      showError('Select an agent first.', 'New Chat');
      return;
    }
    const agent = agents.find((a) => a.id === selectedAgentId);
    const agentVoice = (agent?.ttsVoice as TtsVoiceId) || 'alloy';
    const agentGender = (agent?.ttsGender as TtsGender) || genderForVoice(agentVoice);
    setNewChatName('');
    setNewChatContext('');
    setNewChatGender(agentGender);
    setNewChatVoice(agentVoice);
    setShowNewChatModal(true);
  };

  const createNewChat = async () => {
    if (!selectedAgentId) return;
    const title = newChatName.trim();
    if (!title) {
      showError('Please enter a chat name.', 'New Chat');
      return;
    }
    try {
      setCreating(true);
      const chat = await apiClient.createConversation(
        selectedAgentId,
        {
          title,
          contextPrompt: newChatContext.trim() || undefined,
          ttsVoice: newChatVoice || undefined,
          ttsGender: newChatGender || undefined,
        },
        apiKey,
      );
      setConversations((prev) => [chat, ...prev]);
      setActiveConversation(chat);
      setShowNewChatModal(false);
      showSuccess('Chat created', title);
    } catch (err) {
      showError(err, 'New Chat');
    } finally {
      setCreating(false);
    }
  };

  const openChat = (chat: Conversation) => setActiveConversation(chat);

  const closeChat = async () => {
    const current = activeConversation;
    setActiveConversation(null);
    if (current) {
      try {
        await apiClient.endConversation(current.id, apiKey);
      } catch {
        // ignore
      }
      if (selectedAgentId) await loadConversations(selectedAgentId);
    }
  };

  const deleteChat = async (e: React.MouseEvent, chat: Conversation) => {
    e.stopPropagation();
    if (!confirm(`Delete “${chat.title || 'this chat'}”?`)) return;
    try {
      await apiClient.deleteConversation(chat.id, apiKey);
      setConversations((prev) => prev.filter((c) => c.id !== chat.id));
      if (activeConversation?.id === chat.id) setActiveConversation(null);
      showSuccess('Chat deleted', 'Removed from recents');
    } catch (err) {
      showError(err, 'Delete Chat');
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-black text-white">
      {/* Sidebar */}
      <aside
        className={`flex shrink-0 flex-col border-r border-zinc-800/80 bg-[#171717] transition-all duration-200 ${sidebarOpen ? 'w-[260px]' : 'w-0 overflow-hidden border-0'
          }`}
      >
        <div className="flex items-center gap-2 p-3">
          <button
            type="button"
            onClick={openNewChatModal}
            className="flex flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-sm text-zinc-100 transition hover:bg-zinc-800"
          >
            <SquarePen className="h-4 w-4" />
            New chat
          </button>
        </div>

        <div className="px-3 pb-3">
          <div className="flex items-center justify-between px-1 mb-1.5">
            <label className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Agent
            </label>
            <button
              type="button"
              onClick={openCreateAgentModal}
              className="flex items-center gap-1 text-[11px] font-medium text-zinc-400 hover:text-white transition"
              title="Create new agent"
            >
              <Plus className="h-3 w-3" />
              <span>New</span>
            </button>
          </div>
          {agents.length === 0 ? (
            <button
              type="button"
              onClick={openCreateAgentModal}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs font-medium text-zinc-300 hover:border-zinc-500 hover:bg-zinc-800 hover:text-white transition"
            >
              <Plus className="h-3.5 w-3.5" />
              Create agent
            </button>
          ) : (
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none"
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          <p className="px-3 pb-2 pt-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Recents
          </p>
          {loadingChats ? (
            <p className="px-3 py-4 text-xs text-zinc-500">Loading…</p>
          ) : conversations.length === 0 ? (
            <p className="px-3 py-4 text-xs text-zinc-500">No chats yet</p>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((chat) => {
                const active = activeConversation?.id === chat.id;
                return (
                  <div
                    key={chat.id}
                    className={`group flex items-center gap-1 rounded-lg ${active ? 'bg-zinc-800' : 'hover:bg-zinc-800/70'
                      }`}
                  >
                    <button
                      type="button"
                      onClick={() => openChat(chat)}
                      className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm text-zinc-200"
                      title={chat.contextPrompt || chat.title || ''}
                    >
                      {chat.title || 'Untitled chat'}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => deleteChat(e, chat)}
                      className="mr-1 rounded-md p-1.5 text-zinc-500 opacity-0 transition hover:bg-zinc-700 hover:text-zinc-200 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-zinc-800 p-3 space-y-1">
          {selectedAgentId && (
            <Link
              href={`/documents?agentId=${selectedAgentId}`}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
            >
              <FileText className="h-4 w-4" />
              Manage docs
            </Link>
          )}
          <Link
            href="/"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            <LayoutDashboard className="h-4 w-4" />
            Back to studio
          </Link>
        </div>
      </aside>

      {/* Main */}
      <div className="relative flex min-w-0 flex-1 flex-col bg-black">
        <header className="flex h-14 shrink-0 items-center justify-between px-3 md:px-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded-lg p-2 text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
              aria-label="Toggle sidebar"
            >
              <PanelLeft className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2.5">
              <span className="text-sm font-semibold tracking-tight text-zinc-100">
                {activeConversation?.title || 'Axiomra Voice'}
              </span>
              {selectedAgent && (
                <div className="hidden items-center gap-2 sm:inline-flex">
                  <span className="items-center gap-1.5 rounded-full border border-white/10 bg-zinc-900/80 px-2.5 py-0.5 text-[11px] font-medium text-zinc-200 inline-flex shadow-sm">
                    <Bot className="h-3 w-3 text-emerald-400" />
                    {selectedAgent.name}
                  </span>
                  <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] text-amber-300 font-medium tracking-tight shadow-sm">
                    Wake: &quot;{selectedAgent.startPhrase || 'hey boss'}&quot;
                  </span>
                  <span className="rounded-full bg-rose-500/10 border border-rose-500/30 px-2.5 py-0.5 text-[10px] text-rose-300 font-medium tracking-tight shadow-sm">
                    Stop: &quot;{selectedAgent.endPhrase || 'goodbye'}&quot;
                  </span>
                </div>
              )}
            </div>
          </div>
          {activeConversation && (
            <button
              type="button"
              onClick={closeChat}
              className="rounded-xl border border-white/10 bg-zinc-900/80 px-3 py-1.5 text-xs font-medium text-zinc-300 transition hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30 shadow-sm"
            >
              Close chat
            </button>
          )}
        </header>

        {activeConversation?.contextPrompt?.trim() && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-2">
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 backdrop-blur-md px-4 py-2.5 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">Context</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-zinc-300 leading-relaxed">{activeConversation.contextPrompt}</p>
            </div>
          </div>
        )}

        <div className="min-h-0 flex-1">
          {activeConversation ? (
            <ChatWorkspace
              key={activeConversation.id}
              conversationId={activeConversation.id}
              apiKey={apiKey}
              agentName={selectedAgent?.name || 'Assistant'}
              onError={(err) => showError(err, 'Voice')}
              onClose={closeChat}
            />
          ) : agents.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-4 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900 text-zinc-300 shadow-2xl mb-4 ring-1 ring-white/5">
                <Bot className="h-8 w-8 text-emerald-400" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white md:text-3xl">
                No Voice Agents Available
              </h1>
              <p className="mt-2.5 max-w-md text-sm text-zinc-400">
                To start chatting with realtime voice and testing tools in the playground, create your first agent now.
              </p>
              <button
                type="button"
                onClick={openCreateAgentModal}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 shadow-xl active:scale-95"
              >
                <Plus className="h-4 w-4" />
                Create New Agent
              </button>
            </div>
          ) : (
            <div className="relative flex h-full flex-col items-center justify-center px-4">
              <div className="pointer-events-none absolute h-72 w-72 rounded-full bg-emerald-500/10 blur-[120px]" />
              <h1 className="text-center text-3xl font-light tracking-tight text-white md:text-4xl">
                What can I help with?
              </h1>
              <p className="mt-3 max-w-md text-center text-sm text-zinc-400 leading-relaxed">
                Start a voice session with <span className="text-zinc-200 font-medium">{selectedAgent?.name || 'your agent'}</span> or open an existing conversation from Recents.
              </p>
              <button
                type="button"
                onClick={openNewChatModal}
                disabled={!selectedAgentId}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black transition hover:bg-zinc-200 disabled:opacity-40 shadow-xl active:scale-95"
              >
                <Mic className="h-4 w-4 text-emerald-600" />
                Start Voice Chat
              </button>
              <div className="mt-8 flex items-center gap-2 rounded-full border border-white/5 bg-zinc-900/40 px-4 py-1.5 text-xs text-zinc-500 backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Voice turns on automatically when a chat is open
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New chat modal */}
      {showNewChatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">New chat</h3>
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <label className="block text-xs font-medium text-zinc-400">
              Chat name
              <input
                type="text"
                value={newChatName}
                onChange={(e) => setNewChatName(e.target.value)}
                placeholder="e.g. Interview practice"
                className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
                autoFocus
              />
            </label>

            <label className="mt-4 block text-xs font-medium text-zinc-400">
              Context prompt
              <textarea
                value={newChatContext}
                onChange={(e) => setNewChatContext(e.target.value)}
                placeholder="Optional instructions for this chat only…"
                rows={4}
                className="mt-1.5 w-full resize-y rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-zinc-400">
                Voice gender
                <select
                  value={newChatGender}
                  onChange={(e) => {
                    const g = e.target.value as TtsGender;
                    setNewChatGender(g);
                    const options = voicesForGender(g);
                    if (!newChatVoice || !options.some((v) => v.id === newChatVoice)) {
                      setNewChatVoice(DEFAULT_VOICE_BY_GENDER[g]);
                    }
                  }}
                  className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-zinc-500 focus:outline-none"
                >
                  <option value="neutral">Neutral</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </label>
              <label className="block text-xs font-medium text-zinc-400">
                TTS voice
                <select
                  value={newChatVoice}
                  onChange={(e) => {
                    const v = e.target.value as TtsVoiceId;
                    setNewChatVoice(v);
                    setNewChatGender(genderForVoice(v));
                  }}
                  className="mt-1.5 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-sm text-white focus:border-zinc-500 focus:outline-none"
                >
                  {voicesForGender(newChatGender || 'neutral').map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowNewChatModal(false)}
                className="rounded-xl px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createNewChat}
                disabled={creating || !newChatName.trim()}
                className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black hover:bg-zinc-200 disabled:opacity-40"
              >
                {creating ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Agent Modal */}
      {showCreateAgentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-5 flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-white">
                  <Bot className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Create Voice Agent</h3>
                  <p className="text-xs text-zinc-400">Configure a new agent to chat with immediately</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateAgentModal(false)}
                className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateAgent} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">Agent Name</label>
                <input
                  type="text"
                  required
                  value={newAgentName}
                  onChange={(e) => setNewAgentName(e.target.value)}
                  placeholder="e.g. Sales Assistant, Tech Support"
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">System Instructions / Prompt</label>
                <textarea
                  rows={3}
                  value={newAgentPrompt}
                  onChange={(e) => setNewAgentPrompt(e.target.value)}
                  placeholder="Describe agent personality and rules..."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">LLM Provider</label>
                  <select
                    value={newAgentProvider}
                    onChange={(e) => {
                      const p = e.target.value as 'openai' | 'claude';
                      setNewAgentProvider(p);
                      setNewAgentModel(p === 'openai' ? 'gpt-4o' : 'claude-sonnet-4-5');
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    <option value="openai">OpenAI</option>
                    <option value="claude">Anthropic Claude</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Model</label>
                  <select
                    value={newAgentModel}
                    onChange={(e) => setNewAgentModel(e.target.value)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    {newAgentProvider === 'openai' ? (
                      <>
                        <option value="gpt-4o">gpt-4o</option>
                        <option value="gpt-4o-mini">gpt-4o-mini</option>
                      </>
                    ) : (
                      <>
                        <option value="claude-sonnet-4-5">claude-sonnet-4-5</option>
                        <option value="claude-3-5-sonnet-20241022">claude-3-5-sonnet</option>
                        <option value="claude-3-5-haiku-20241022">claude-3-5-haiku</option>
                      </>
                    )}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">Voice Gender</label>
                  <select
                    value={newAgentGender}
                    onChange={(e) => {
                      const g = e.target.value as TtsGender;
                      setNewAgentGender(g);
                      setNewAgentVoice(DEFAULT_VOICE_BY_GENDER[g]);
                    }}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    <option value="neutral">Neutral</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-300 mb-1">TTS Voice</label>
                  <select
                    value={newAgentVoice}
                    onChange={(e) => setNewAgentVoice(e.target.value as TtsVoiceId)}
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white focus:outline-none"
                  >
                    {voicesForGender(newAgentGender).map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} ({v.gender})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1.5">Enabled Capabilities / Tools</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'web_search', label: 'Web Search' },
                    { id: 'get_time', label: 'Current Time' },
                    { id: 'search_knowledge_base', label: 'Knowledge Base' },
                  ].map((tool) => {
                    const checked = newAgentTools.includes(tool.id);
                    return (
                      <label
                        key={tool.id}
                        className={`flex items-center gap-2 rounded-lg border p-2 text-xs cursor-pointer transition ${
                          checked
                            ? 'border-zinc-500 bg-zinc-800 text-white'
                            : 'border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) setNewAgentTools((t) => [...t, tool.id]);
                            else setNewAgentTools((t) => t.filter((x) => x !== tool.id));
                          }}
                          className="rounded border-zinc-700 text-white"
                        />
                        <span>{tool.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Start & End Lifecycle Trigger Phrases */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-200">Voice Activation & End Triggers</label>
                  <span className="text-[10px] text-zinc-400">Custom start & farewell words</span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                      Start Message (Wake Phrase) <span className="text-amber-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newAgentStartPhrase}
                      onChange={(e) => setNewAgentStartPhrase(e.target.value)}
                      placeholder="e.g. hey boss"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">Starts listening & working</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                      End Message (Stop Phrase) <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={newAgentEndPhrase}
                      onChange={(e) => setNewAgentEndPhrase(e.target.value)}
                      placeholder="e.g. goodbye"
                      className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                    />
                    <p className="text-[10px] text-zinc-500 mt-1">Stops & closes call</p>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Farewell Audio Message
                  </label>
                  <input
                    type="text"
                    value={newAgentFarewellMessage}
                    onChange={(e) => setNewAgentFarewellMessage(e.target.value)}
                    placeholder="e.g. Goodbye! Talk to you soon."
                    className="w-full rounded-lg border border-zinc-700 bg-zinc-800/80 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-zinc-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-zinc-500 mt-1">Spoken before session disconnects</p>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-3 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setShowCreateAgentModal(false)}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingAgent}
                  className="rounded-lg bg-white px-5 py-2 text-sm font-semibold text-black hover:bg-zinc-200 transition disabled:opacity-50"
                >
                  {creatingAgent ? 'Creating…' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function VoicePlaygroundPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-black text-sm text-zinc-500">
          Loading…
        </div>
      }
    >
      <PlaygroundContent />
    </Suspense>
  );
}
