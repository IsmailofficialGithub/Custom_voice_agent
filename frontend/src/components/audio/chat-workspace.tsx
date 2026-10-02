'use client';

import React, { useEffect, useRef, useState } from 'react';
import { VoiceSessionClient, VoiceState } from '../../lib/voice-client';
import { apiClient, Message } from '../../lib/api-client';
import {
  Mic,
  MicOff,
  Pause,
  Play,
  Send,
  Square,
  Zap,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  MessageSquare,
  X,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AiOrb, OrbTheme } from './ai-orb';

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
  onClose?: () => void;
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

export function ChatWorkspace({ conversationId, apiKey, agentName, onError, onClose }: Props) {
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [inputText, setInputText] = useState('');
  const [callState, setCallState] = useState<VoiceState>('connecting');
  const [audioLevel, setAudioLevel] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [partial, setPartial] = useState('');
  const [ready, setReady] = useState(false);
  const [vadMode, setVadMode] = useState<'auto' | 'manual'>('auto');
  const [isRecordingManual, setIsRecordingManual] = useState(false);
  const [orbTheme, setOrbTheme] = useState<OrbTheme>('emerald');
  const [showTextInput, setShowTextInput] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);

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
    const elapsedNow = turnStartTimeRef.current
      ? Math.max(60, Date.now() - turnStartTimeRef.current)
      : turnElapsedMs || 60;
    const total =
      overrideMetrics?.totalMs && overrideMetrics.totalMs > 0
        ? overrideMetrics.totalMs
        : currentTurnMetricsRef.current?.totalMs || elapsedNow;

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
  const scrollAnchorRef = useRef<HTMLDivElement>(null);
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
                totalMs: Math.max(
                  50,
                  metrics.total_to_first_audio_ms ||
                    (turnStartTimeRef.current ? Date.now() - turnStartTimeRef.current : 60)
                ),
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
          wsUrl
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
    scrollAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
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
    if (callState === 'speaking') {
      interrupt();
      return;
    }
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

  const resetChat = async () => {
    try {
      setMessages([]);
      setPartial('');
      if (clientRef.current) {
        clientRef.current.interrupt();
      }
    } catch {}
  };

  // Status headline text like the screenshots
  const getStatusHeadline = () => {
    if (isPaused) return 'Voice session paused';
    if (!ready) return 'Connecting to voice core…';
    if (callState === 'user_speaking') return "Psst... Speak up, I'm listening";
    if (callState === 'transcribing') return 'Understanding what you said…';
    if (callState === 'thinking') return 'Thinking…';
    if (callState === 'generating_speech' || callState === 'speaking') return `${agentName} is speaking…`;
    if (vadMode === 'manual') return 'Tap the microphone to speak';
    return "Psst... Speak up, I'm listening";
  };

  const isEmerald = orbTheme === 'emerald';
  const lastAssistantMessage = [...messages].reverse().find((m) => m.sender === 'assistant');
  const lastUserMessage = [...messages].reverse().find((m) => m.sender === 'user');

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#09090b] text-white">
      {/* Background ambient radial glow matching active theme */}
      <div
        className={`pointer-events-none absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[420px] rounded-full blur-[120px] opacity-25 transition-colors duration-700 ${
          isEmerald ? 'bg-emerald-500' : 'bg-purple-600'
        }`}
      />

      {/* Top Header Bar */}
      <div className="relative z-10 flex shrink-0 items-center justify-between border-b border-white/5 bg-zinc-950/40 px-5 py-3 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 border border-white/10 shadow-inner">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                ready && !isPaused
                  ? isEmerald
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-purple-400 shadow-[0_0_8px_#c084fc]'
                  : 'bg-zinc-500'
              }`}
            />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-100">{agentName}</h1>
            <p className="text-[11px] text-zinc-400">
              {ready ? (isPaused ? 'Paused' : 'Live Voice Session') : 'Connecting…'}
            </p>
          </div>
        </div>

        {/* Action Controls in Top Bar */}
        <div className="flex items-center gap-2">
          {/* Theme switcher (Emerald vs Aurora) */}
          <div className="flex items-center rounded-full border border-white/10 bg-zinc-900/80 p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setOrbTheme('emerald')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                isEmerald ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Emerald Bio-Glow Theme"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Emerald
            </button>
            <button
              type="button"
              onClick={() => setOrbTheme('aurora')}
              className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition ${
                !isEmerald ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Iridescent Aurora Theme"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
              Aurora
            </button>
          </div>

          {/* Reset / Clear Chat */}
          <button
            type="button"
            onClick={resetChat}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
            title="Reset conversation"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>

          {/* Pause / Resume Voice */}
          <button
            type="button"
            onClick={togglePause}
            className={`flex h-8 w-8 items-center justify-center rounded-full border border-white/10 transition ${
              isPaused
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100'
            }`}
            title={isPaused ? 'Resume voice' : 'Pause voice'}
          >
            {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-zinc-900 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-100"
              title="Close chat"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="relative flex flex-1 flex-col items-center justify-between overflow-y-auto px-4 py-4 md:px-8">
        {/* Dynamic Status Headline */}
        <div className="my-2 flex flex-col items-center text-center">
          <h2 className="text-xl md:text-2xl font-light tracking-tight text-zinc-200 transition-all duration-300">
            {getStatusHeadline()}
          </h2>
          {turnElapsedMs !== null && (
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-3 py-0.5 text-xs font-mono text-emerald-400">
              <Zap className="h-3 w-3 animate-pulse" />
              {(turnElapsedMs / 1000).toFixed(2)}s turn
            </div>
          )}
        </div>

        {/* Centered 3D Glowing AI Globe */}
        <div className="my-auto flex flex-col items-center justify-center">
          <AiOrb
            audioLevel={audioLevel}
            state={callState}
            theme={orbTheme}
            size={280}
            onClick={toggleRecording}
          />
        </div>

        {/* Live Utterance & Conversational Subtitles */}
        <div className="w-full max-w-xl px-2 mb-2 flex flex-col items-center">
          {/* Real-time partial user transcript */}
          {partial ? (
            <div className="w-full animate-fade-in rounded-2xl border border-white/10 bg-zinc-900/70 p-4 text-center backdrop-blur-md shadow-xl">
              <p className="text-xs uppercase font-semibold tracking-wider text-emerald-400 mb-1">
                You are saying…
              </p>
              <p className="text-[15px] italic text-zinc-200 leading-relaxed">
                "{partial}"
              </p>
            </div>
          ) : callState === 'user_speaking' && !partial ? (
            <div className="rounded-full border border-white/10 bg-zinc-900/60 px-4 py-1.5 text-xs text-zinc-400 backdrop-blur-sm animate-pulse">
              Listening to your voice…
            </div>
          ) : lastAssistantMessage ? (
            <div className="w-full rounded-2xl border border-white/5 bg-zinc-900/40 p-4 backdrop-blur-md shadow-lg transition hover:bg-zinc-900/60">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-medium text-zinc-400 flex items-center gap-1.5">
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                  {agentName}
                </span>
                {lastAssistantMessage.latency && (
                  <span
                    className="inline-flex items-center gap-1 font-mono text-[10px] text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded-full"
                    title={`STT: ${lastAssistantMessage.latency.sttMs ?? '?'}ms · LLM: ${lastAssistantMessage.latency.llmMs ?? '?'}ms · TTS: ${lastAssistantMessage.latency.ttsMs ?? '?'}ms`}
                  >
                    <Zap className="h-2.5 w-2.5" />
                    {(lastAssistantMessage.latency.totalMs / 1000).toFixed(2)}s turn
                  </span>
                )}
              </div>
              <p className="text-[14px] leading-relaxed text-zinc-100 max-h-28 overflow-y-auto pr-1">
                {lastAssistantMessage.text}
              </p>
            </div>
          ) : (
            <p className="text-center text-xs text-zinc-500">
              Say something to {agentName} or tap the microphone below
            </p>
          )}

          {/* Toggle for Full History Modal/Drawer */}
          {messages.length > 1 && (
            <button
              type="button"
              onClick={() => setShowFullHistory(!showFullHistory)}
              className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-400 hover:text-zinc-200 transition"
            >
              {showFullHistory ? (
                <>
                  <ChevronUp className="h-3 w-3" /> Hide history ({messages.length} messages)
                </>
              ) : (
                <>
                  <ChevronDown className="h-3 w-3" /> View conversation history ({messages.length})
                </>
              )}
            </button>
          )}

          {/* Expanded Conversation History */}
          {showFullHistory && (
            <div className="mt-3 w-full max-h-60 overflow-y-auto space-y-3 rounded-2xl border border-white/10 bg-zinc-950/90 p-4 shadow-2xl backdrop-blur-xl">
              {messages.map((m) => (
                <div key={m.id} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-xs leading-relaxed ${
                      m.sender === 'user'
                        ? 'bg-zinc-800 text-white'
                        : 'bg-zinc-900 border border-white/5 text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-0.5">
                      <span className="font-semibold text-[10px] text-zinc-400">
                        {m.sender === 'user' ? 'You' : agentName}
                      </span>
                      {m.latency && (
                        <span className="font-mono text-[9px] text-emerald-400">
                          {(m.latency.totalMs / 1000).toFixed(2)}s
                        </span>
                      )}
                    </div>
                    <p>{m.text}</p>
                  </div>
                </div>
              ))}
              <div ref={scrollAnchorRef} />
            </div>
          )}
        </div>
      </div>

      {/* Floating Glassmorphic Control Dock */}
      <div className="relative z-10 shrink-0 px-4 pb-6 pt-2">
        <div className="mx-auto flex max-w-md flex-col items-center gap-3">
          {/* Optional expandable text input */}
          {showTextInput && (
            <div className="flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-zinc-900/90 px-3 py-2 shadow-2xl backdrop-blur-xl animate-fade-in">
              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendText()}
                placeholder="Type your message…"
                className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={sendText}
                disabled={!inputText.trim()}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-black transition hover:bg-zinc-200 disabled:opacity-30"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowTextInput(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Main Floating Capsule Pill */}
          <div className="flex items-center justify-between gap-5 rounded-full border border-white/10 bg-zinc-950/80 px-5 py-2.5 shadow-[0_15px_35px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
            {/* Left: Waveform / Equalizer Visualizer */}
            <div className="flex items-center gap-1 h-6 w-10 justify-center">
              {[0, 1, 2, 3, 4].map((i) => {
                const waveHeight =
                  callState === 'user_speaking'
                    ? Math.max(4, Math.sin(i * 0.8 + audioLevel / 8) * 16 + audioLevel * 0.2)
                    : callState === 'speaking'
                      ? Math.max(4, Math.sin(i * 1.2 + Date.now() / 150) * 12 + 6)
                      : 4;
                return (
                  <span
                    key={i}
                    className={`w-[2.5px] rounded-full transition-all duration-75 ${
                      isEmerald ? 'bg-emerald-400' : 'bg-purple-400'
                    }`}
                    style={{ height: `${Math.min(waveHeight, 20)}px` }}
                  />
                );
              })}
            </div>

            {/* Center: Glowing Circular Microphone Button */}
            <div className="relative flex items-center justify-center">
              {/* Outer pulsing ring when speaking */}
              {(callState === 'user_speaking' || callState === 'speaking') && (
                <span
                  className={`absolute -inset-2.5 rounded-full animate-ping opacity-35 ${
                    isEmerald ? 'bg-emerald-500' : 'bg-purple-500'
                  }`}
                />
              )}
              <button
                type="button"
                onClick={toggleRecording}
                className={`relative flex h-14 w-14 items-center justify-center rounded-full transition-all duration-300 shadow-2xl active:scale-95 ${
                  callState === 'user_speaking'
                    ? isEmerald
                      ? 'bg-emerald-500 text-black shadow-[0_0_30px_rgba(16,185,129,0.7)] ring-4 ring-emerald-400/30'
                      : 'bg-purple-500 text-white shadow-[0_0_30px_rgba(168,85,247,0.7)] ring-4 ring-purple-400/30'
                    : callState === 'speaking'
                      ? 'bg-rose-600 text-white shadow-[0_0_25px_rgba(225,29,72,0.7)]'
                      : 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 hover:shadow-[0_0_20px_rgba(255,255,255,0.15)]'
                }`}
                title={
                  callState === 'speaking'
                    ? 'Tap to stop agent speech'
                    : callState === 'user_speaking'
                      ? 'Listening… tap to send'
                      : 'Tap to speak'
                }
              >
                {callState === 'speaking' ? (
                  <Square className="h-5 w-5 fill-current" />
                ) : (
                  <Mic className="h-6 w-6" />
                )}
              </button>
            </div>

            {/* Right: Text Input & Mode Toggle */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowTextInput(!showTextInput)}
                className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/10 transition ${
                  showTextInput
                    ? 'bg-white text-black'
                    : 'bg-zinc-900 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                }`}
                title="Type text message"
              >
                <MessageSquare className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => switchVadMode(vadMode === 'auto' ? 'manual' : 'auto')}
                className={`rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide border transition ${
                  vadMode === 'auto'
                    ? isEmerald
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                      : 'border-purple-500/40 bg-purple-500/10 text-purple-400'
                    : 'border-white/10 bg-zinc-900 text-zinc-400'
                }`}
                title="Toggle Auto VAD vs Tap to Talk"
              >
                {vadMode === 'auto' ? 'AUTO' : 'TAP'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
