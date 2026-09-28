'use client';

import React, { useState, useEffect, useRef } from 'react';
import { VoiceSessionClient, VoiceState } from '../../lib/voice-client';
import { apiClient, Message } from '../../lib/api-client';
import { Mic, MicOff, PhoneOff, Square, Send, Volume2, MessageSquare, X } from 'lucide-react';

interface VoiceCallScreenProps {
  agentName: string;
  agentModel?: string;
  conversationId: string;
  conversationTitle?: string | null;
  apiKey: string;
  onEndCall: () => void;
  onError?: (err: string) => void;
}

interface ChatBubble {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

function statusLabel(state: VoiceState, isMuted: boolean, agentName: string): string {
  switch (state) {
    case 'connecting':
      return 'Connecting…';
    case 'connected':
      return 'Connected';
    case 'listening':
      return isMuted ? 'Muted — tap mic to unmute' : 'Listening — speak anytime';
    case 'user_speaking':
      return 'Hearing you…';
    case 'silence_detected':
      return 'Got it — wrapping up…';
    case 'transcribing':
      return 'Understanding your speech…';
    case 'thinking':
      return 'Thinking…';
    case 'speaking':
      return `${agentName} is speaking`;
    case 'error':
      return 'Something went wrong';
    default:
      return 'Ready';
  }
}

function mapHistory(messages: Message[]): ChatBubble[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .filter((m) => m.content?.trim())
    .map((m) => ({
      id: m.id,
      sender: m.role as 'user' | 'assistant',
      text: m.content,
      timestamp: new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }));
}

export function VoiceCallScreen({
  agentName,
  agentModel = 'GPT-4o Voice',
  conversationId,
  conversationTitle,
  apiKey,
  onEndCall,
  onError,
}: VoiceCallScreenProps) {
  const [callState, setCallState] = useState<VoiceState>('connecting');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [partialTranscript, setPartialTranscript] = useState('');
  const [inputText, setInputText] = useState('');
  const [showChatText, setShowChatText] = useState(true);
  const [callDurationSec, setCallDurationSec] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);

  const voiceClientRef = useRef<VoiceSessionClient | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setInterval(() => setCallDurationSec((prev) => prev + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setHistoryLoading(true);
    setMessages([]);

    apiClient
      .getMessages(conversationId, apiKey)
      .then((history) => {
        if (!cancelled) setMessages(mapHistory(history));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setHistoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, apiKey]);

  useEffect(() => {
    let client: VoiceSessionClient | null = null;

    const initClient = async () => {
      try {
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3002/api/v1/voice';
        client = new VoiceSessionClient(
          conversationId,
          apiKey,
          {
            onConnected: () => setCallState('connected'),
            onPartialTranscript: (text) => setPartialTranscript(text),
            onFinalTranscript: (text) => {
              setPartialTranscript('');
              addUserMessage(text);
            },
            onResponseTextChunk: (text) => addOrAppendAssistant(text),
            onStatusChange: (status) => setCallState(status),
            onError: (err) => onError?.(err),
            onAudioLevelChange: (level) => setAudioLevel(level),
          },
          wsUrl,
        );

        await client.connect();
        await client.startCall();
        voiceClientRef.current = client;
      } catch (err) {
        console.error('Failed to start voice call', err);
        onError?.(err instanceof Error ? err.message : 'Voice call initialization failed');
      }
    };

    initClient();

    return () => {
      client?.disconnect();
      voiceClientRef.current = null;
    };
  }, [conversationId, apiKey]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partialTranscript]);

  const addUserMessage = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.sender === 'user' && last.text.trim() === trimmed) return prev;
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          sender: 'user',
          text: trimmed,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
    });
  };

  const addOrAppendAssistant = (text: string) => {
    if (!text) return;
    setMessages((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].sender === 'assistant') {
        const updated = [...prev];
        const lastMsg = updated[updated.length - 1];
        updated[updated.length - 1] = { ...lastMsg, text: lastMsg.text + text };
        return updated;
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          sender: 'assistant',
          text,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
    });
  };

  const toggleMute = () => {
    if (voiceClientRef.current) setIsMuted(voiceClientRef.current.togglePause());
  };

  const handleInterrupt = () => voiceClientRef.current?.interrupt();

  const handleSendText = () => {
    if (!inputText.trim()) return;
    const text = inputText.trim();
    setInputText('');
    addUserMessage(text);
    voiceClientRef.current?.sendTextMessage(text);
  };

  const handleEndCall = () => {
    voiceClientRef.current?.disconnect();
    onEndCall();
  };

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const isLive =
    callState === 'user_speaking' ||
    callState === 'speaking' ||
    callState === 'thinking' ||
    callState === 'transcribing';
  const orbScale = 1 + Math.min(audioLevel, 80) / 400;

  return (
    <div className="relative flex min-h-[640px] w-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(34,211,238,0.14), transparent 55%), radial-gradient(ellipse 60% 40% at 80% 100%, rgba(16,185,129,0.1), transparent 50%)',
        }}
      />

      <header className="relative z-10 flex items-center justify-between gap-3 border-b border-white/8 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-400/80">Live call</p>
          <h2 className="truncate text-lg font-semibold text-slate-50">{conversationTitle || agentName}</h2>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            {agentName} · {agentModel} · {formatDuration(callDurationSec)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => setShowChatText(!showChatText)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              showChatText
                ? 'border-cyan-500/40 bg-cyan-500/15 text-cyan-200'
                : 'border-white/10 bg-white/5 text-slate-400 hover:text-slate-200'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>
          <button
            type="button"
            onClick={handleEndCall}
            className="rounded-full border border-white/10 bg-white/5 p-2 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
            aria-label="Close call panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-5 px-5 py-8">
        <div className="relative flex h-44 w-44 items-center justify-center">
          <div
            className={`absolute rounded-full transition-all duration-300 ${
              callState === 'speaking' || callState === 'user_speaking' ? 'bg-white/10' : 'bg-white/5'
            }`}
            style={{ width: `${140 + audioLevel * 0.9}px`, height: `${140 + audioLevel * 0.9}px` }}
          />
          <div
            className={`relative flex h-28 w-28 items-center justify-center rounded-full transition-transform duration-150 ${
              callState === 'speaking'
                ? 'bg-[var(--text)] text-[var(--bg)]'
                : callState === 'user_speaking'
                  ? 'bg-[var(--text-muted)] text-[var(--bg)]'
                  : callState === 'thinking' || callState === 'transcribing'
                    ? 'animate-pulse bg-[var(--surface)] text-[var(--text)]'
                    : isMuted
                      ? 'border border-[var(--danger)] bg-[var(--surface)] text-[var(--danger)]'
                      : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--text)]'
            }`}
            style={{ transform: `scale(${orbScale})` }}
          >
            {callState === 'speaking' ? (
              <Volume2 className="h-9 w-9" />
            ) : isMuted ? (
              <MicOff className="h-9 w-9" />
            ) : (
              <Mic className="h-9 w-9" />
            )}
          </div>
        </div>

        <p
          className={`rounded-full border px-4 py-1.5 text-sm font-medium ${
            callState === 'error'
              ? 'border-rose-500/30 bg-rose-500/10 text-rose-200'
              : isLive
                ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-100'
                : 'border-white/10 bg-white/5 text-slate-300'
          }`}
        >
          {statusLabel(callState, isMuted, agentName)}
        </p>
      </div>

      {showChatText && (
        <div className="relative z-10 mx-4 mb-3 max-h-56 space-y-3 overflow-y-auto rounded-2xl border border-white/8 bg-slate-900/80 px-4 py-3 backdrop-blur-md">
          {historyLoading ? (
            <p className="py-6 text-center text-sm text-slate-500">Loading chat history…</p>
          ) : messages.length === 0 && !partialTranscript ? (
            <p className="py-6 text-center text-sm text-slate-500">
              Say something, or type below — {agentName} will reply in voice and text.
            </p>
          ) : (
            <>
              {messages.map((m) => (
                <div key={m.id} className={`flex flex-col ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-slate-500">
                    <span className={m.sender === 'user' ? 'text-cyan-400/90' : 'text-emerald-400/90'}>
                      {m.sender === 'user' ? 'You' : agentName}
                    </span>
                    <span>{m.timestamp}</span>
                  </div>
                  <div
                    className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                      m.sender === 'user'
                        ? 'rounded-br-md bg-cyan-600 text-white'
                        : 'rounded-bl-md border border-white/10 bg-slate-800 text-slate-100'
                    }`}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {partialTranscript && (
                <div className="flex flex-col items-end">
                  <span className="mb-1 text-[10px] uppercase tracking-wide text-cyan-400/80">You · live</span>
                  <div className="max-w-[90%] rounded-2xl rounded-br-md border border-cyan-500/30 bg-cyan-950/60 px-3.5 py-2.5 text-sm italic text-cyan-100/90">
                    {partialTranscript}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      )}

      <footer className="relative z-10 border-t border-white/8 px-4 pb-5 pt-3">
        <div className="mb-3 flex items-center gap-2">
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSendText()}
            placeholder="Type a message…"
            className="flex-1 rounded-xl border border-white/10 bg-slate-900/90 px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/50 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleSendText}
            disabled={!inputText.trim()}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-600 text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={toggleMute}
            className={`rounded-2xl p-3.5 transition ${
              isMuted
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-600/25'
                : 'border border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
            }`}
          >
            {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
          {callState === 'speaking' && (
            <button
              type="button"
              onClick={handleInterrupt}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-500 px-4 py-3.5 text-xs font-semibold text-slate-950 transition hover:bg-amber-400"
            >
              <Square className="h-4 w-4 fill-current" />
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={handleEndCall}
            className="inline-flex items-center gap-2 rounded-2xl bg-rose-600 px-5 py-3.5 text-xs font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500"
          >
            <PhoneOff className="h-4 w-4" />
            End call
          </button>
        </div>
      </footer>
    </div>
  );
}
