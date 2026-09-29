'use client';

import React, { useEffect, useRef, useState } from 'react';
import { VoiceSessionClient, VoiceState } from '../../lib/voice-client';
import { apiClient, Message } from '../../lib/api-client';
import { Pause, Play, Send, Square } from 'lucide-react';

interface ChatBubble {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
}

interface Props {
  conversationId: string;
  apiKey: string;
  agentName: string;
  onError?: (err: string) => void;
}

function mapHistory(messages: Message[]): ChatBubble[] {
  return messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content?.trim())
    .map((m) => ({
      id: m.id,
      sender: m.role as 'user' | 'assistant',
      text: m.content,
    }));
}

export function ChatWorkspace({ conversationId, apiKey, agentName, onError }: Props) {
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [inputText, setInputText] = useState('');
  const [callState, setCallState] = useState<VoiceState>('connecting');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [partial, setPartial] = useState('');
  const [ready, setReady] = useState(false);

  const clientRef = useRef<VoiceSessionClient | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .getMessages(conversationId, apiKey)
      .then((history) => {
        if (!cancelled) setMessages(mapHistory(history));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [conversationId, apiKey]);

  useEffect(() => {
    let client: VoiceSessionClient | null = null;

    const boot = async () => {
      try {
        const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3002/api/v1/voice';
        client = new VoiceSessionClient(
          conversationId,
          apiKey,
          {
            onConnected: () => setCallState('connected'),
            onPartialTranscript: (t) => setPartial(t),
            onFinalTranscript: (t) => {
              setPartial('');
              pushUser(t);
            },
            onResponseTextChunk: (t) => pushAssistant(t),
            onStatusChange: (s) => setCallState(s),
            onError: (e) => onError?.(e),
            onAudioLevelChange: (l) => setAudioLevel(l),
            onLatencyMetrics: (metrics) => {
              console.log('[Turn Latency Metrics]', metrics);
            },
          },
          wsUrl,
        );
        await client.connect();
        await client.startCall();
        clientRef.current = client;
        setReady(true);
      } catch (err) {
        onError?.(err instanceof Error ? err.message : 'Failed to start voice session');
      }
    };

    boot();
    return () => {
      client?.disconnect();
      clientRef.current = null;
      setReady(false);
    };
  }, [conversationId, apiKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, partial, callState]);

  const pushUser = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.sender === 'user' && last.text === trimmed) return prev;
      return [...prev, { id: `${Date.now()}-u`, sender: 'user', text: trimmed }];
    });
  };

  const pushAssistant = (text: string) => {
    if (!text) return;
    setMessages((prev) => {
      if (prev.length && prev[prev.length - 1].sender === 'assistant') {
        const next = [...prev];
        next[next.length - 1] = { ...next[next.length - 1], text };
        return next;
      }
      return [...prev, { id: `${Date.now()}-a`, sender: 'assistant', text }];
    });
  };

  const sendText = () => {
    const text = inputText.trim();
    if (!text || !clientRef.current) return;
    setInputText('');
    pushUser(text);
    clientRef.current.sendTextMessage(text);
  };

  const togglePause = () => {
    if (!clientRef.current) return;
    setIsPaused(clientRef.current.togglePause());
  };

  const interrupt = () => clientRef.current?.interrupt();

  const isBusy =
    callState === 'transcribing' ||
    callState === 'thinking' ||
    callState === 'generating_speech' ||
    callState === 'speaking';

  const bars = Array.from({ length: 8 }, (_, i) => {
    const wave = Math.sin(i * 0.55 + audioLevel / 8) * 0.5 + 0.5;
    const h = callState === 'user_speaking' ? 6 + wave * (10 + audioLevel * 0.35) : 6;
    return h;
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 overflow-y-auto px-4 pb-4 pt-6 md:px-8">
        {messages.length === 0 && !partial ? (
          <div className="flex h-full min-h-[40vh] flex-col items-center justify-center">
            <h1 className="text-center text-3xl font-semibold tracking-tight text-white md:text-4xl">
              What can I help with?
            </h1>
            <p className="mt-3 max-w-md text-center text-sm text-zinc-500">
              Speak anytime or type below. {agentName} is listening
              {ready ? '' : '…'}.
            </p>
          </div>
        ) : (
          <div className="mx-auto w-full max-w-3xl space-y-6">
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-3xl px-4 py-3 text-[15px] leading-relaxed ${
                    m.sender === 'user' ? 'bg-zinc-800 text-white' : 'bg-transparent text-zinc-100'
                  }`}
                >
                  {m.sender === 'assistant' && (
                    <p className="mb-1 text-xs font-medium text-zinc-500">{agentName}</p>
                  )}
                  <p className="whitespace-pre-wrap">{m.text}</p>
                </div>
              </div>
            ))}
            {partial && (
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-3xl bg-zinc-800/70 px-4 py-3 text-[15px] italic text-zinc-300">
                  {partial}
                </div>
              </div>
            )}
            {isBusy && (
              <p className="text-sm text-zinc-500">
                {callState === 'speaking'
                  ? `${agentName} is speaking…`
                  : callState === 'transcribing'
                    ? 'Understanding…'
                    : 'Thinking…'}
              </p>
            )}
            <div ref={endRef} />
          </div>
        )}
      </div>

      <div className="px-3 pb-5 pt-2 md:px-6">
        <div className="mx-auto w-full max-w-3xl">
          <div className="flex items-center gap-2 rounded-[28px] border border-zinc-700/80 bg-zinc-900 px-3 py-2.5 shadow-2xl shadow-black/40">
            <button
              type="button"
              onClick={togglePause}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                isPaused ? 'bg-amber-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
              title={isPaused ? 'Resume voice' : 'Pause voice'}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>

            <input
              ref={inputRef}
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendText()}
              placeholder={isPaused ? 'Voice paused — type a message' : 'Ask anything, or just speak…'}
              className="h-10 min-w-0 flex-1 bg-transparent text-[15px] text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />

            {!isPaused && callState === 'user_speaking' && (
              <div className="flex h-8 w-14 shrink-0 items-center justify-center gap-[2px]" aria-hidden>
                {bars.map((h, i) => (
                  <span
                    key={i}
                    className="w-[2px] rounded-full bg-emerald-400/80 transition-[height] duration-75"
                    style={{ height: `${Math.min(h, 22)}px` }}
                  />
                ))}
              </div>
            )}

            {callState === 'speaking' ? (
              <button
                type="button"
                onClick={interrupt}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900"
                title="Stop"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </button>
            ) : (
              <button
                type="button"
                onClick={sendText}
                disabled={!inputText.trim()}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-900 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Send className="h-4 w-4" />
              </button>
            )}
          </div>
          <p className="mt-2 text-center text-[11px] text-zinc-600">
            {isPaused
              ? 'Voice paused — mic off, typing still works'
              : callState === 'user_speaking'
                ? 'Hearing you… keep talking or type anytime'
                : ready
                  ? 'Voice is on — speak or type'
                  : 'Connecting…'}
          </p>
        </div>
      </div>
    </div>
  );
}
