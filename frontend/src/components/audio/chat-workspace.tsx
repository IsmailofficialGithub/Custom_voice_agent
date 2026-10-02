'use client';

import React, { useEffect, useRef, useState } from 'react';
import { VoiceSessionClient, VoiceState } from '../../lib/voice-client';
import { apiClient, Message } from '../../lib/api-client';
import { Pause, Play, Send, Square, Clock, Zap, Mic, MicOff } from 'lucide-react';

export interface LatencyInfo {
  totalMs: number;
  sttMs?: number;
  llmMs?: number;
  ttsMs?: number;
}

interface ChatBubble {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  latency?: LatencyInfo;
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
  const [vadMode, setVadMode] = useState<'auto' | 'manual'>('auto');
  const [isRecordingManual, setIsRecordingManual] = useState(false);

  // Live turn timer & metrics
  const [turnElapsedMs, setTurnElapsedMs] = useState<number | null>(null);
  const [lastTurnLatency, setLastTurnLatency] = useState<LatencyInfo | null>(null);
  const turnStartTimeRef = useRef<number | null>(null);
  const turnTimerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentTurnMetricsRef = useRef<LatencyInfo | null>(null);

  const startTurnTimer = () => {
    if (turnStartTimeRef.current !== null) return;
    turnStartTimeRef.current = Date.now();
    currentTurnMetricsRef.current = null;
    if (turnTimerIntervalRef.current) clearInterval(turnTimerIntervalRef.current);
    turnTimerIntervalRef.current = setInterval(() => {
      if (turnStartTimeRef.current) {
        setTurnElapsedMs(Date.now() - turnStartTimeRef.current);
      }
    }, 50);
  };

  const stopTurnTimer = (overrideMetrics?: Partial<LatencyInfo>): LatencyInfo => {
    if (turnTimerIntervalRef.current) {
      clearInterval(turnTimerIntervalRef.current);
      turnTimerIntervalRef.current = null;
    }
    const elapsedNow = turnStartTimeRef.current ? Math.max(60, Date.now() - turnStartTimeRef.current) : (turnElapsedMs || 60);
    const total = overrideMetrics?.totalMs && overrideMetrics.totalMs > 0
      ? overrideMetrics.totalMs
      : (currentTurnMetricsRef.current?.totalMs || elapsedNow);

    const latency: LatencyInfo = {
      totalMs: total,
      sttMs: overrideMetrics?.sttMs ?? currentTurnMetricsRef.current?.sttMs,
      llmMs: overrideMetrics?.llmMs ?? currentTurnMetricsRef.current?.llmMs,
      ttsMs: overrideMetrics?.ttsMs ?? currentTurnMetricsRef.current?.ttsMs,
    };
    currentTurnMetricsRef.current = latency;
    setLastTurnLatency(latency);
    setTurnElapsedMs(latency.totalMs);
    return latency;
  };

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
            onPartialTranscript: (t) => {
              startTurnTimer();
              setPartial(t);
            },
            onFinalTranscript: (t) => {
              startTurnTimer();
              setPartial('');
              pushUser(t);
            },
            onResponseTextChunk: (t) => {
              const latency = stopTurnTimer();
              pushAssistant(t, latency);
            },
            onStatusChange: (s) => {
              setCallState(s);
              if (s !== 'user_speaking') {
                setIsRecordingManual(false);
              }
              if (s === 'user_speaking') {
                startTurnTimer();
              } else if (s === 'speaking') {
                stopTurnTimer();
              } else if (s === 'listening' || s === 'idle') {
                if (turnTimerIntervalRef.current) {
                  clearInterval(turnTimerIntervalRef.current);
                  turnTimerIntervalRef.current = null;
                }
                turnStartTimeRef.current = null;
                setTurnElapsedMs(null);
              }
            },
            onError: (e) => onError?.(e),
            onAudioLevelChange: (l) => setAudioLevel(l),
            onLatencyMetrics: (metrics) => {
              const latency: LatencyInfo = {
                totalMs: Math.max(50, metrics.total_to_first_audio_ms || (turnStartTimeRef.current ? Date.now() - turnStartTimeRef.current : 60)),
                sttMs: metrics.stt_duration_ms,
                llmMs: metrics.llm_first_token_duration_ms,
                ttsMs: metrics.tts_first_chunk_duration_ms,
              };
              stopTurnTimer(latency);
              setMessages((prev) => {
                if (prev.length && prev[prev.length - 1].sender === 'assistant') {
                  const next = [...prev];
                  next[next.length - 1] = {
                    ...next[next.length - 1],
                    latency,
                  };
                  return next;
                }
                return prev;
              });
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
      if (turnTimerIntervalRef.current) clearInterval(turnTimerIntervalRef.current);
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

  const pushAssistant = (text: string, latency?: LatencyInfo) => {
    if (!text) return;
    setMessages((prev) => {
      const metric = latency || currentTurnMetricsRef.current || undefined;
      if (prev.length && prev[prev.length - 1].sender === 'assistant') {
        const next = [...prev];
        const lastMsg = next[next.length - 1];
        next[next.length - 1] = {
          ...lastMsg,
          text,
          latency: lastMsg.latency || metric,
        };
        return next;
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-a`,
          sender: 'assistant',
          text,
          latency: metric,
        },
      ];
    });
  };

  const sendText = () => {
    const text = inputText.trim();
    if (!text || !clientRef.current) return;
    startTurnTimer();
    setInputText('');
    pushUser(text);
    clientRef.current.sendTextMessage(text);
  };

  const togglePause = () => {
    if (!clientRef.current) return;
    setIsPaused(clientRef.current.togglePause());
  };

  const toggleRecording = () => {
    if (!clientRef.current) return;
    if (callState === 'user_speaking' || isRecordingManual) {
      setIsRecordingManual(false);
      clientRef.current.stopManualRecordingAndSend();
    } else {
      setIsRecordingManual(true);
      clientRef.current.startManualRecording();
    }
  };

  const switchVadMode = (mode: 'auto' | 'manual') => {
    setVadMode(mode);
    setIsRecordingManual(false);
    clientRef.current?.setVadMode(mode);
  };

  const interrupt = () => {
    if (turnTimerIntervalRef.current) {
      clearInterval(turnTimerIntervalRef.current);
      turnTimerIntervalRef.current = null;
    }
    turnStartTimeRef.current = null;
    setTurnElapsedMs(null);
    clientRef.current?.interrupt();
  };

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
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-xs font-medium text-zinc-400">{agentName}</p>
                      {m.latency && m.latency.totalMs > 50 && (
                        <span
                          className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full"
                          title={`STT: ${m.latency.sttMs ?? '?'}ms · LLM: ${m.latency.llmMs ?? '?'}ms · TTS: ${m.latency.ttsMs ?? '?'}ms`}
                        >
                          <Zap className="h-2.5 w-2.5" />
                          {(m.latency.totalMs / 1000).toFixed(2)}s turn
                        </span>
                      )}
                    </div>
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
              <div className="flex flex-wrap items-center gap-2.5 text-sm text-zinc-400">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>
                  {callState === 'speaking'
                    ? `${agentName} is speaking…`
                    : callState === 'transcribing'
                      ? 'Understanding…'
                      : callState === 'generating_speech'
                        ? 'Synthesizing voice…'
                        : 'Thinking…'}
                </span>
                {turnElapsedMs !== null && (
                  <span className="inline-flex items-center gap-1 font-mono text-xs text-emerald-400 font-semibold bg-emerald-950/70 border border-emerald-800/80 px-2.5 py-0.5 rounded-full shadow-sm">
                    <Clock className="h-3 w-3 animate-spin" />
                    {(turnElapsedMs / 1000).toFixed(2)}s
                  </span>
                )}
              </div>
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
              onClick={toggleRecording}
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition ${
                callState === 'user_speaking'
                  ? 'bg-rose-600 text-white animate-pulse ring-4 ring-rose-500/30 shadow-lg shadow-rose-900/50'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white'
              }`}
              title={
                callState === 'user_speaking'
                  ? 'Tap to finish speaking & send'
                  : vadMode === 'manual'
                    ? 'Tap to speak'
                    : 'Tap to speak now'
              }
            >
              <Mic className="h-4 w-4" />
            </button>

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
              placeholder={isPaused ? 'Voice paused — type a message' : 'Ask anything, or speak…'}
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
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 px-3">
            <div className="flex items-center gap-2">
              <span>
                {isPaused
                  ? 'Voice paused — mic off'
                  : callState === 'user_speaking'
                    ? isRecordingManual
                      ? 'Recording voice… tap mic to send'
                      : 'Hearing you… speak or tap mic to send'
                    : callState === 'transcribing'
                      ? 'Understanding speech…'
                      : callState === 'thinking'
                        ? 'Thinking…'
                        : callState === 'speaking'
                          ? `${agentName} is speaking…`
                          : ready
                            ? vadMode === 'manual'
                              ? 'Tap mic to speak'
                              : 'Auto-detecting voice — speak anytime'
                            : 'Connecting…'}
              </span>

              {ready && !isPaused && (
                <div className="inline-flex items-center rounded-md bg-zinc-800/90 p-0.5 border border-zinc-700/60 shadow-inner">
                  <button
                    type="button"
                    onClick={() => switchVadMode('auto')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                      vadMode === 'auto'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Hands-free auto speech detection"
                  >
                    Auto
                  </button>
                  <button
                    type="button"
                    onClick={() => switchVadMode('manual')}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition ${
                      vadMode === 'manual'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                    title="Tap mic to start/stop speaking manually"
                  >
                    Tap to Talk
                  </button>
                </div>
              )}
            </div>
            {lastTurnLatency && lastTurnLatency.totalMs > 50 && (
              <span className="font-mono text-zinc-400 flex items-center gap-1.5">
                <span className="text-zinc-500">Last turn:</span>
                <span className="inline-flex items-center gap-1 text-emerald-400 font-semibold bg-zinc-800/80 px-2 py-0.5 rounded-md border border-zinc-700/60">
                  <Zap className="h-3 w-3" />
                  {(lastTurnLatency.totalMs / 1000).toFixed(2)}s
                  {lastTurnLatency.sttMs !== undefined && (
                    <span className="text-[10px] text-zinc-400 font-normal">
                      ({lastTurnLatency.sttMs}ms STT · {lastTurnLatency.llmMs}ms LLM · {lastTurnLatency.ttsMs}ms TTS)
                    </span>
                  )}
                </span>
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
