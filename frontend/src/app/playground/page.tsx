'use client';

import React, { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '../../context/auth-context';
import { useToast } from '../../context/toast-context';
import { apiClient, Agent, Conversation } from '../../lib/api-client';
import { ChatWorkspace } from '../../components/audio/chat-workspace';
import {
  PanelLeft,
  SquarePen,
  Trash2,
  X,
  Bot,
  LayoutDashboard,
  FileText,
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
          <label className="mb-1.5 block px-1 text-[11px] font-medium uppercase tracking-wide text-zinc-500">
            Agent
          </label>
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
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-zinc-100">
                {activeConversation?.title || 'Axiomra Voice'}
              </span>
              {selectedAgent && (
                <span className="hidden items-center gap-1 rounded-full border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 sm:inline-flex">
                  <Bot className="h-3 w-3" />
                  {selectedAgent.name}
                </span>
              )}
            </div>
          </div>
          {activeConversation && (
            <button
              type="button"
              onClick={closeChat}
              className="rounded-lg px-3 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-900 hover:text-zinc-200"
            >
              Close chat
            </button>
          )}
        </header>

        {activeConversation?.contextPrompt?.trim() && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-2">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 px-4 py-2.5">
              <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Context</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-zinc-300">{activeConversation.contextPrompt}</p>
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
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center px-4">
              <h1 className="text-center text-3xl font-semibold tracking-tight text-white md:text-4xl">
                What can I help with?
              </h1>
              <p className="mt-3 max-w-md text-center text-sm text-zinc-500">
                Start a new chat with a name and context, or open one from Recents.
              </p>
              <button
                type="button"
                onClick={openNewChatModal}
                disabled={!selectedAgentId}
                className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:opacity-40"
              >
                <SquarePen className="h-4 w-4" />
                New chat
              </button>
              <div className="mt-10 w-full max-w-2xl rounded-[28px] border border-zinc-800 bg-zinc-900/80 px-4 py-3 text-center text-sm text-zinc-500">
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
