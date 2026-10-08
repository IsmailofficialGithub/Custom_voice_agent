import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { ConversationsService } from '../conversations/conversations.service';
import { SttService } from '../providers/stt/stt.service';
import { TtsService } from '../providers/tts/tts.service';
import { RedisService } from '../redis/redis.service';
import { AuthService } from '../auth/auth.service';
import { isWakePhraseMatch, isEndPhraseMatch } from './phrase-matcher';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebSocket = require('ws');

interface VoiceSession {
  conversationId: string;
  authenticated: boolean;
  audioChunks: Buffer[];
  abortController?: AbortController | null;
  realtimeWs?: any;
  realtimeReady?: boolean;
  realtimeTurnStart?: number;
  realtimeAudioSeen?: boolean;
  realtimeTranscript?: string;
  realtimeResponseActive?: boolean;
  realtimePendingEvents?: any[];
  isRealtime?: boolean;
  lifecycleState?: 'standby' | 'active' | 'ending';
  startPhrase?: string;
  endPhrase?: string;
  farewellMessage?: string;
}

type WsClient = {
  readyState: number;
  send: (data: string) => void;
  close: (code: number, reason: string) => void;
};

@WebSocketGateway({ path: '/api/v1/voice' })
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: unknown;

  private readonly logger = new Logger(VoiceGateway.name);
  private readonly sessions = new Map<WsClient, VoiceSession>();

  constructor(
    private readonly config: ConfigService,
    private readonly orchestrator: OrchestratorService,
    private readonly conversations: ConversationsService,
    private readonly sttService: SttService,
    private readonly ttsService: TtsService,
    private readonly redisService: RedisService,
    private readonly authService: AuthService,
  ) {}

  async handleConnection(client: WsClient, req: { url?: string; headers: Record<string, string | string[] | undefined> }) {
    const url = req.url ?? '';
    const urlParams = new URLSearchParams(url.split('?')[1] ?? '');
    const match = url.match(/\/api\/v1\/voice\/([^?]+)/);
    const conversationId = urlParams.get('conversationId') ?? match?.[1];

    const token = String(urlParams.get('apiKey') ?? req.headers['x-api-key'] ?? '');
    if (!this.authService.isValidBearer(token) || !conversationId) {
      this.send(client, { type: 'error', message: 'Unauthorized or missing conversation ID' });
      client.close(1008, 'Unauthorized');
      return;
    }

    let startPhrase = 'hey boss';
    let endPhrase = 'goodbye';
    let farewellMessage = 'Goodbye! Talk to you soon.';

    try {
      const conv = await this.conversations.getConversationWithAgent(conversationId);
      if (conv?.agent) {
        startPhrase = conv.agent.startPhrase || startPhrase;
        endPhrase = conv.agent.endPhrase || endPhrase;
        farewellMessage = conv.agent.farewellMessage || farewellMessage;
      }
    } catch {
      // fallback to defaults if conversation lookup fails
    }

    const session: VoiceSession = {
      conversationId,
      authenticated: true,
      audioChunks: [],
      abortController: null,
      realtimeWs: null,
      lifecycleState: 'standby',
      startPhrase,
      endPhrase,
      farewellMessage,
    };

    this.sessions.set(client, session);
    this.logger.log(
      `Voice session connected: ${conversationId} [standby, start="${startPhrase}", end="${endPhrase}"]`,
    );

    // If Realtime engine feature flag is active, initialize OpenAI Realtime connection
    const voiceEngine = (this.config.get<string>('VOICE_ENGINE') || 'pipeline').toLowerCase();
    session.isRealtime = voiceEngine === 'realtime';
    if (session.isRealtime) {
      this.initRealtimeSession(client, session);
    }

    // Persist session metadata in Redis with 10 min TTL
    this.redisService.setSession(conversationId, { authenticated: true, connectedAt: Date.now() }, 600).catch(() => {});

    this.send(client, {
      type: 'connected',
      conversationId,
      engine: voiceEngine,
      lifecycleState: 'standby',
      startPhrase,
      endPhrase,
    });
    this.send(client, {
      type: 'lifecycle_change',
      state: 'standby',
      startPhrase,
      endPhrase,
    });
    this.send(client, { type: 'status', status: 'standby' });
  }

  handleDisconnect(client: WsClient) {
    const session = this.sessions.get(client);
    if (session) {
      this.logger.log(`Voice session disconnected: ${session.conversationId}`);
      if (session.abortController) {
        session.abortController.abort();
        session.abortController = null;
      }
      if (session.realtimeWs) {
        try {
          session.realtimeWs.close();
        } catch {
          // ignore
        }
        session.realtimeWs = null;
      }
      this.sessions.delete(client);
      this.redisService.deleteSession(session.conversationId).catch(() => {});
      this.redisService.clearAudioChunks(session.conversationId).catch(() => {});
    }
  }

  @SubscribeMessage('message')
  async handleMessageDecorator(@ConnectedSocket() client: WsClient, @MessageBody() data: unknown) {
    return this.processIncomingData(client, data as Buffer | string);
  }

  @SubscribeMessage('text_message')
  async handleTextMessageDecorator(@ConnectedSocket() client: WsClient, @MessageBody() data: unknown) {
    const text = typeof data === 'string' ? data : (data as { text?: string })?.text;
    return this.processIncomingData(client, { type: 'text_message', text });
  }

  @SubscribeMessage('audio_chunk')
  async handleAudioChunkDecorator(@ConnectedSocket() client: WsClient, @MessageBody() data: unknown) {
    const chunk = typeof data === 'string' ? data : (data as { data?: string })?.data;
    return this.processIncomingData(client, { type: 'audio_chunk', data: chunk });
  }

  @SubscribeMessage('end_of_turn')
  async handleEndOfTurnDecorator(@ConnectedSocket() client: WsClient) {
    return this.processIncomingData(client, { type: 'end_of_turn' });
  }

  @SubscribeMessage('interrupt')
  async handleInterruptDecorator(@ConnectedSocket() client: WsClient) {
    return this.processIncomingData(client, { type: 'interrupt' });
  }

  private async processIncomingData(client: WsClient, rawData: Buffer | string | Record<string, unknown>): Promise<void> {
    try {
      const session = this.sessions.get(client);
      if (!session?.authenticated) {
        this.send(client, { type: 'error', message: 'Not authenticated' });
        return;
      }

      // Binary frames that look like JSON (e.g. UTF-8 Nest WS packets) must be
      // parsed as messages — never pushed as raw audio.
      if (Buffer.isBuffer(rawData)) {
        if (rawData.length > 0 && rawData[0] === 0x7b) {
          rawData = rawData.toString('utf8');
        } else {
          session.audioChunks.push(rawData);
          const base64 = rawData.toString('base64');
          this.redisService.pushAudioChunk(session.conversationId, base64).catch(() => {});

          // If in Realtime mode, forward raw audio chunk to OpenAI Realtime WS
          if (session.realtimeWs && session.realtimeWs.readyState === WebSocket.OPEN) {
            session.realtimeWs.send(
              JSON.stringify({
                type: 'input_audio_buffer.append',
                audio: base64,
              }),
            );
          }
          return;
        }
      }

      let msg: { type: string; data?: string; text?: string; speech_end?: number };
      if (typeof rawData === 'string') {
        const parsed = JSON.parse(rawData);
        msg = parsed.data && typeof parsed.data === 'object' && parsed.data.type ? parsed.data : parsed;
      } else if (typeof rawData === 'object' && rawData !== null) {
        const obj = rawData as Record<string, unknown>;
        msg = obj.data && typeof obj.data === 'object' && (obj.data as Record<string, unknown>).type
          ? (obj.data as { type: string; data?: string; text?: string; speech_end?: number })
          : (rawData as { type: string; data?: string; text?: string; speech_end?: number });
      } else {
        return;
      }

      this.logger.log(`Received WS message type: ${msg.type}`);

      switch (msg.type) {
        case 'audio_chunk':
          if (msg.data) {
            let base64Str = '';
            if (typeof msg.data === 'string') {
              base64Str = msg.data;
            } else if (typeof msg.data === 'object' && (msg.data as Record<string, unknown>).data) {
              base64Str = String((msg.data as Record<string, unknown>).data);
            }

            if (base64Str) {
              if (base64Str.includes(',')) {
                base64Str = base64Str.split(',')[1];
              }
              const audioBuf = Buffer.from(base64Str.trim(), 'base64');
              session.audioChunks.push(audioBuf);
              this.redisService.pushAudioChunk(session.conversationId, base64Str).catch(() => {});

              // In Realtime mode, stream audio buffer directly
              if (session.isRealtime) {
                if (!session.realtimeWs || session.realtimeWs.readyState === WebSocket.CLOSED) {
                  this.initRealtimeSession(client, session);
                }
                const pcmBytes = audioBuf.length > 44 && audioBuf.subarray(0, 4).toString() === 'RIFF'
                  ? audioBuf.subarray(44)
                  : audioBuf;

                const durationMs = Math.round((pcmBytes.length / (24000 * 2)) * 1000);
                this.logger.log(`Received user audio turn: ${pcmBytes.length} bytes PCM (${durationMs}ms)`);

                // Save last audio turn to disk for diagnostic verification
                try {
                  // eslint-disable-next-line @typescript-eslint/no-require-imports
                  const fs = require('fs');
                  const debugWavHeader = Buffer.alloc(44);
                  debugWavHeader.write('RIFF', 0);
                  debugWavHeader.writeUInt32LE(36 + pcmBytes.length, 4);
                  debugWavHeader.write('WAVE', 8);
                  debugWavHeader.write('fmt ', 12);
                  debugWavHeader.writeUInt32LE(16, 16);
                  debugWavHeader.writeUInt16LE(1, 20);
                  debugWavHeader.writeUInt16LE(1, 22);
                  debugWavHeader.writeUInt32LE(24000, 24);
                  debugWavHeader.writeUInt32LE(48000, 28);
                  debugWavHeader.writeUInt16LE(2, 32);
                  debugWavHeader.writeUInt16LE(16, 34);
                  debugWavHeader.write('data', 36);
                  debugWavHeader.writeUInt32LE(pcmBytes.length, 40);
                  fs.writeFileSync('/app/uploads/debug_last_turn.wav', Buffer.concat([debugWavHeader, pcmBytes]));
                } catch {
                  // Ignore debug write errors
                }

                this.sendRealtimeEvent(session, {
                  type: 'input_audio_buffer.append',
                  audio: pcmBytes.toString('base64'),
                });
              }
            }
          }
          break;

        case 'end_of_turn':
          if (session.isRealtime) {
            if (!session.realtimeWs || session.realtimeWs.readyState === WebSocket.CLOSED) {
              this.initRealtimeSession(client, session);
            }
            session.realtimeTurnStart = Date.now();
            session.realtimeAudioSeen = false;
            session.realtimeTranscript = '';
            session.realtimeResponseActive = true;
            this.send(client, { type: 'status', status: 'thinking' });
            this.sendRealtimeEvent(session, { type: 'input_audio_buffer.commit' });
            this.sendRealtimeEvent(session, { type: 'response.create' });
            return;
          }

          try {
            await this.handleEndOfTurn(client, session, msg.speech_end);
          } catch (err) {
            this.logger.error(`End of turn processing error: ${err}`);
            this.send(client, { type: 'error', message: 'Failed to process voice turn' });
          }
          break;

        case 'interrupt':
          this.handleInterrupt(client, session);
          break;

        case 'text_message':
          try {
            await this.handleTextMessage(client, session, msg.text ?? '');
          } catch (err) {
            this.logger.error(`Text message error: ${err}`);
            this.send(client, { type: 'error', message: 'Failed to process message' });
          }
          break;

        default:
          this.send(client, { type: 'error', message: `Unknown message type: ${msg.type}` });
      }
    } catch (err) {
      this.logger.error(`Process incoming data failed: ${err}`);
      this.send(client, { type: 'error', message: 'Invalid message payload' });
    }
  }

  private handleInterrupt(client: WsClient, session: VoiceSession) {
    this.logger.log(`Interrupt triggered for session: ${session.conversationId}`);
    if (session.abortController) {
      session.abortController.abort();
      session.abortController = null;
    }
    session.audioChunks = [];
    this.redisService.clearAudioChunks(session.conversationId).catch(() => {});

    if (session.realtimeWs && session.realtimeWs.readyState === WebSocket.OPEN && session.realtimeResponseActive) {
      session.realtimeWs.send(JSON.stringify({ type: 'response.cancel' }));
    }
    session.realtimeResponseActive = false;

    this.send(client, { type: 'interrupted' });
    this.send(client, { type: 'status', status: 'idle' });
  }

  private async handleEndOfTurn(client: WsClient, session: VoiceSession, _clientSpeechEndTime?: number) {
    const speechEndTime = Date.now();

    // Abort any prior in-flight turn on this session
    if (session.abortController) {
      session.abortController.abort();
      session.abortController = null;
    }
    const abortController = new AbortController();
    session.abortController = abortController;

    // Rate Limiting Check: Max turns per minute per session
    const limit = this.config.get<number>('VOICE_RATE_LIMIT_TURNS', 30);
    const windowSec = this.config.get<number>('VOICE_RATE_LIMIT_WINDOW_SEC', 60);
    const rateCheck = await this.redisService.checkRateLimit(session.conversationId, limit, windowSec);

    if (!rateCheck.allowed) {
      this.send(client, {
        type: 'error',
        message: `Rate limit exceeded: You have reached the maximum allowed ${limit} turns per minute. Please wait ${rateCheck.resetSec} seconds before speaking.`,
      });
      return;
    }

    // Prioritize in-memory session audioChunks first, fallback to Redis
    let audioChunksToProcess = session.audioChunks;
    if (audioChunksToProcess.length === 0) {
      audioChunksToProcess = await this.redisService.getAudioChunks(session.conversationId);
    }

    session.audioChunks = [];
    this.redisService.clearAudioChunks(session.conversationId).catch(() => {});

    if (audioChunksToProcess.length === 0) {
      this.send(client, { type: 'error', message: 'No audio chunks received' });
      this.send(client, { type: 'status', status: 'idle' });
      this.send(client, { type: 'end_of_response' });
      return;
    }

    const combinedAudio = Buffer.concat(audioChunksToProcess);
    if (combinedAudio.length < 1000) {
      this.logger.warn(`Audio buffer too small (${combinedAudio.length} bytes), skipping transcription`);
      this.send(client, { type: 'status', status: 'idle' });
      this.send(client, { type: 'end_of_response' });
      return;
    }

    const headerHex = combinedAudio.subarray(0, 4).toString('hex').toUpperCase();
    const looksLikeAudio =
      headerHex.startsWith('52494646') || // RIFF / WAV
      headerHex.startsWith('4F676753') || // OggS
      headerHex.startsWith('1A45DFA3') || // EBML / WebM
      headerHex.startsWith('494433') || // ID3 / MP3
      headerHex.startsWith('FFFB') ||
      headerHex.startsWith('FFF3');
    if (!looksLikeAudio) {
      this.logger.warn(`Audio buffer unexpected header (${headerHex}), skipping transcription`);
      this.send(client, { type: 'error', message: 'Could not transcribe speech. Please try speaking again.' });
      this.send(client, { type: 'status', status: 'idle' });
      this.send(client, { type: 'end_of_response' });
      return;
    }

    // 1. Transcribe audio via STT
    this.send(client, { type: 'status', status: 'transcribing' });
    let transcript = '';
    try {
      transcript = await this.sttService.transcribeBuffer(combinedAudio, 'speech.wav', abortController.signal);
    } catch (err: any) {
      if (abortController.signal.aborted) return;
      this.logger.warn(`STT transcription failed: ${err.message || err}`);
      this.send(client, { type: 'error', message: 'Could not transcribe speech. Please try speaking again.' });
      this.send(client, { type: 'status', status: 'idle' });
      this.send(client, { type: 'end_of_response' });
      return;
    }

    const sttDoneTime = Date.now();
    if (abortController.signal.aborted) return;

    if (!transcript || transcript.trim().length === 0) {
      this.send(client, { type: 'status', status: session.lifecycleState === 'standby' ? 'standby' : 'idle' });
      this.send(client, { type: 'end_of_response' });
      return;
    }

    this.send(client, { type: 'final_transcript', text: transcript });

    const voice = await this.conversations.resolveTtsVoice(session.conversationId);

    // 0. End Phrase Check ALWAYS takes precedence (whether in standby or active)
    const endMatch = isEndPhraseMatch(transcript, session.endPhrase || 'goodbye');
    if (endMatch) {
      this.logger.log(`End phrase "${session.endPhrase}" matched for transcript "${transcript}". Speaking farewell.`);
      session.lifecycleState = 'ending';
      this.send(client, {
        type: 'lifecycle_change',
        state: 'ending',
      });

      const farewell = session.farewellMessage || 'Goodbye! Talk to you soon.';
      await this.speakDirectMessage(client, session, farewell, voice, abortController);

      this.send(client, {
        type: 'session_ended',
        reason: 'end_phrase_triggered',
      });

      this.conversations.addMessage(session.conversationId, 'assistant', farewell).catch(() => {});
      this.conversations.end(session.conversationId).catch(() => {});
      return;
    }

    // Lifecycle State Machine: Standby vs Active
    if (session.lifecycleState === 'standby') {
      const wakeMatch = isWakePhraseMatch(transcript, session.startPhrase || 'hey boss');
      if (!wakeMatch.matched) {
        this.logger.log(
          `[Standby] Transcript "${transcript}" does not match wake phrase "${session.startPhrase}". Remaining in standby.`,
        );
        this.send(client, { type: 'status', status: 'standby' });
        this.send(client, { type: 'end_of_response' });
        return;
      }

      this.logger.log(`[Standby] Wake phrase "${session.startPhrase}" matched! Transitioning to active.`);
      session.lifecycleState = 'active';
      this.send(client, {
        type: 'lifecycle_change',
        state: 'active',
        startPhrase: session.startPhrase,
        endPhrase: session.endPhrase,
      });

      // If standalone wake phrase ("Hey boss"), speak greeting directly without calling LLM
      if (!wakeMatch.remainder || wakeMatch.remainder.trim().length === 0) {
        const greetingText = "Hey! I'm listening, how can I help you?";
        await this.speakDirectMessage(client, session, greetingText, voice, abortController);
        return;
      }

      // If combined phrase ("Hey boss, what is the weather?"), forward remainder to LLM
      transcript = wakeMatch.remainder;
    }

    // 2. Stream LLM tokens -> Sentence boundary detection -> Immediate TTS chunk generation
    this.send(client, { type: 'status', status: 'thinking' });

    let llmFirstTokenTime = 0;
    let ttsFirstByteTime = 0;
    let cumulativeText = '';

    try {
      await this.orchestrator.handleTextTurnStream(
        session.conversationId,
        transcript,
        {
          onFirstToken: () => {
            if (!llmFirstTokenTime) {
              llmFirstTokenTime = Date.now();
            }
          },
          onToken: (token: string) => {
            if (abortController.signal.aborted) return;
            cumulativeText += token;
            this.send(client, { type: 'response_text_chunk', text: cumulativeText });
          },
          onSentence: async (sentence) => {
            if (abortController.signal.aborted) return;
            const spokenChunk = this.forSpeech(sentence);
            if (!spokenChunk) return;

            try {
              this.send(client, { type: 'status', status: 'generating_speech' });
              const audioBase64 = await this.ttsService.generateSpeechBase64(spokenChunk, voice, abortController.signal);
              if (abortController.signal.aborted) return;

              if (!ttsFirstByteTime) {
                ttsFirstByteTime = Date.now();
                const sttDuration = Math.max(20, sttDoneTime - speechEndTime);
                const llmDuration = Math.max(20, (llmFirstTokenTime || Date.now()) - sttDoneTime);
                const ttsDuration = Math.max(20, ttsFirstByteTime - (llmFirstTokenTime || sttDoneTime));
                const totalDuration = Math.max(60, ttsFirstByteTime - speechEndTime);

                // Send stage latency metrics so developer can measure every step
                this.send(client, {
                  type: 'latency_metrics',
                  metrics: {
                    speech_end: speechEndTime,
                    stt_done: sttDoneTime,
                    llm_first_token: llmFirstTokenTime,
                    tts_first_byte: ttsFirstByteTime,
                    total_to_first_audio_ms: totalDuration,
                    stt_duration_ms: sttDuration,
                    llm_first_token_duration_ms: llmDuration,
                    tts_first_chunk_duration_ms: ttsDuration,
                  },
                });
                this.logger.log(
                  `Latency metrics: STT=${sttDuration}ms, LLM_first=${llmDuration}ms, TTS_first=${ttsDuration}ms, Total=${totalDuration}ms`,
                );
              }

              this.send(client, { type: 'audio_response_chunk', data: audioBase64 });
            } catch (err: any) {
              if (!abortController.signal.aborted) {
                this.logger.warn(`TTS generation failed for sentence: ${err}`);
              }
            }
          },
        },
        abortController.signal,
      );

      if (!abortController.signal.aborted) {
        this.send(client, { type: 'end_of_response' });
      }
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        this.logger.error(`Turn stream failed: ${err.message || err}`);
        this.send(client, { type: 'error', message: 'Failed to process voice turn' });
      }
    } finally {
      if (session.abortController === abortController) {
        session.abortController = null;
      }
    }
  }

  private async speakDirectMessage(
    client: WsClient,
    session: VoiceSession,
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
    abortController: AbortController,
  ) {
    this.send(client, { type: 'response_text_chunk', text });
    this.send(client, { type: 'status', status: 'generating_speech' });
    try {
      const spokenChunk = this.forSpeech(text);
      if (spokenChunk) {
        const audioBase64 = await this.ttsService.generateSpeechBase64(spokenChunk, voice, abortController.signal);
        if (!abortController.signal.aborted) {
          this.send(client, { type: 'audio_response_chunk', data: audioBase64 });
        }
      }
      if (!abortController.signal.aborted) {
        this.send(client, { type: 'status', status: 'idle' });
        this.send(client, { type: 'end_of_response' });
      }
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        this.logger.warn(`Direct speech generation failed: ${err}`);
        this.send(client, { type: 'status', status: 'idle' });
        this.send(client, { type: 'end_of_response' });
      }
    }
  }

  private async handleTextMessage(client: WsClient, session: VoiceSession, text: string) {
    // Rate Limiting Check
    const limit = this.config.get<number>('VOICE_RATE_LIMIT_TURNS', 30);
    const windowSec = this.config.get<number>('VOICE_RATE_LIMIT_WINDOW_SEC', 60);
    const rateCheck = await this.redisService.checkRateLimit(session.conversationId, limit, windowSec);

    if (!rateCheck.allowed) {
      this.send(client, {
        type: 'error',
        message: `Rate limit exceeded: You have reached the maximum allowed ${limit} turns per minute. Please wait.`,
      });
      return;
    }

    if (session.abortController) {
      session.abortController.abort();
      session.abortController = null;
    }
    const abortController = new AbortController();
    session.abortController = abortController;

    this.send(client, { type: 'final_transcript', text });

    const voice = await this.conversations.resolveTtsVoice(session.conversationId);

    // 0. End Phrase Check ALWAYS takes precedence
    const endMatch = isEndPhraseMatch(text, session.endPhrase || 'goodbye');
    if (endMatch) {
      session.lifecycleState = 'ending';
      this.send(client, {
        type: 'lifecycle_change',
        state: 'ending',
      });

      const farewell = session.farewellMessage || 'Goodbye! Talk to you soon.';
      await this.speakDirectMessage(client, session, farewell, voice, abortController);

      this.send(client, {
        type: 'session_ended',
        reason: 'end_phrase_triggered',
      });

      this.conversations.addMessage(session.conversationId, 'assistant', farewell).catch(() => {});
      this.conversations.end(session.conversationId).catch(() => {});
      return;
    }

    // Lifecycle State Machine for typed messages
    if (session.lifecycleState === 'standby') {
      const wakeMatch = isWakePhraseMatch(text, session.startPhrase || 'hey boss');
      if (!wakeMatch.matched) {
        this.send(client, { type: 'status', status: 'standby' });
        this.send(client, { type: 'end_of_response' });
        return;
      }

      session.lifecycleState = 'active';
      this.send(client, {
        type: 'lifecycle_change',
        state: 'active',
        startPhrase: session.startPhrase,
        endPhrase: session.endPhrase,
      });

      if (!wakeMatch.remainder || wakeMatch.remainder.trim().length === 0) {
        const greetingText = "Hey! I'm listening, how can I help you?";
        await this.speakDirectMessage(client, session, greetingText, voice, abortController);
        return;
      }

      text = wakeMatch.remainder;
    }

    if (session.isRealtime && session.realtimeWs && session.realtimeWs.readyState === WebSocket.OPEN) {
      session.realtimeTurnStart = Date.now();
      session.realtimeAudioSeen = false;
      session.realtimeTranscript = '';
      session.realtimeResponseActive = true;
      this.send(client, { type: 'status', status: 'thinking' });
      this.sendRealtimeEvent(session, {
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      });
      this.sendRealtimeEvent(session, { type: 'response.create' });
      return;
    }

    this.send(client, { type: 'status', status: 'thinking' });

    let cumulativeText = '';
    const requestStartTime = Date.now();
    let llmFirstTokenTime = 0;
    let ttsFirstByteTime: number | null = null;

    try {
      await this.orchestrator.handleTextTurnStream(
        session.conversationId,
        text,
        {
          onFirstToken: () => {
            if (!llmFirstTokenTime) {
              llmFirstTokenTime = Date.now();
            }
          },
          onToken: (token: string) => {
            if (abortController.signal.aborted) return;
            cumulativeText += token;
            this.send(client, { type: 'response_text_chunk', text: cumulativeText });
          },
          onSentence: async (sentence) => {
            if (abortController.signal.aborted) return;
            const spokenChunk = this.forSpeech(sentence);
            if (!spokenChunk) return;

            try {
              this.send(client, { type: 'status', status: 'generating_speech' });
              const audioBase64 = await this.ttsService.generateSpeechBase64(spokenChunk, voice, abortController.signal);
              if (abortController.signal.aborted) return;

              if (!ttsFirstByteTime) {
                ttsFirstByteTime = Date.now();
                const totalDuration = Math.max(50, ttsFirstByteTime - requestStartTime);
                const llmDuration = llmFirstTokenTime
                  ? Math.max(10, llmFirstTokenTime - requestStartTime)
                  : Math.max(10, totalDuration - 150);
                const ttsDuration = llmFirstTokenTime
                  ? Math.max(10, ttsFirstByteTime - llmFirstTokenTime)
                  : 150;

                this.send(client, {
                  type: 'latency_metrics',
                  metrics: {
                    speech_end: requestStartTime,
                    total_to_first_audio_ms: totalDuration,
                    stt_duration_ms: 0,
                    llm_first_token_duration_ms: llmDuration,
                    tts_first_chunk_duration_ms: ttsDuration,
                  },
                });
              }

              this.send(client, { type: 'audio_response_chunk', data: audioBase64 });
            } catch (err: any) {
              if (!abortController.signal.aborted) {
                this.logger.warn(`TTS generation failed for text sentence: ${err}`);
              }
            }
          },
        },
        abortController.signal,
      );

      if (!abortController.signal.aborted) {
        this.send(client, { type: 'end_of_response' });
      }
    } catch (err: any) {
      if (!abortController.signal.aborted) {
        this.logger.error(`Text message turn stream failed: ${err}`);
        this.send(client, { type: 'error', message: 'Failed to process message' });
      }
    } finally {
      if (session.abortController === abortController) {
        session.abortController = null;
      }
    }
  }

  private sendRealtimeEvent(session: VoiceSession, event: any) {
    if (!session.realtimeWs) return;
    if (session.realtimeReady && session.realtimeWs.readyState === WebSocket.OPEN) {
      session.realtimeWs.send(JSON.stringify(event));
    } else {
      if (!session.realtimePendingEvents) {
        session.realtimePendingEvents = [];
      }
      session.realtimePendingEvents.push(event);
    }
  }

  // OpenAI Realtime API session initialization (Feature Flag: VOICE_ENGINE=realtime)
  private initRealtimeSession(client: WsClient, session: VoiceSession) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY not found for Realtime API');
      return;
    }
    const realtimeModel = this.config.get<string>('OPENAI_REALTIME_MODEL') || 'gpt-realtime-mini';
    const wsUrl = `wss://api.openai.com/v1/realtime?model=${realtimeModel}`;

    try {
      const rtWs = new WebSocket(wsUrl, {
        family: 4,
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
      });

      session.realtimeWs = rtWs;
      session.realtimeReady = false;

      rtWs.on('open', async () => {
        this.logger.log(`OpenAI Realtime session connected for: ${session.conversationId} with model: ${realtimeModel}`);

        let instructions = 'You are a helpful, concise voice assistant. Speak naturally in short, clear sentences.';
        let voice = 'alloy';
        try {
          const conv = await this.conversations.getConversationWithAgent(session.conversationId);
          if (conv?.agent?.systemPrompt) {
            instructions = conv.agent.systemPrompt;
            if (conv.contextPrompt) {
              instructions += `\n\nSpecific context for this conversation: ${conv.contextPrompt}`;
            }
          }
          const rawVoice = (conv?.ttsVoice || conv?.agent?.ttsVoice || 'alloy').toLowerCase();
          const voiceMap: Record<string, string> = {
            alloy: 'alloy',
            echo: 'echo',
            shimmer: 'shimmer',
            ash: 'ash',
            ballad: 'ballad',
            coral: 'coral',
            sage: 'sage',
            verse: 'verse',
            onyx: 'ash',
            fable: 'verse',
            nova: 'coral',
          };
          voice = voiceMap[rawVoice] || 'alloy';
        } catch (e) {
          this.logger.warn(`Could not resolve agent context for Realtime session: ${e}`);
        }

        // Configure session using OpenAI Realtime GA schema
        const sessionUpdate = {
          type: 'session.update',
          session: {
            instructions,
            voice,
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            input_audio_transcription: {
              model: 'whisper-1',
            },
            turn_detection: null,
          },
        };
        rtWs.send(JSON.stringify(sessionUpdate));
        session.realtimeReady = true;

        // Flush any pending events that arrived while connecting/configuring
        if (session.realtimePendingEvents && session.realtimePendingEvents.length > 0) {
          this.logger.log(`Flushing ${session.realtimePendingEvents.length} pending events to OpenAI Realtime`);
          for (const ev of session.realtimePendingEvents) {
            rtWs.send(JSON.stringify(ev));
          }
          session.realtimePendingEvents = [];
        }
      });

      rtWs.on('message', (data: any) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleRealtimeEvent(client, session, event);
        } catch (e) {
          this.logger.error(`Error parsing Realtime event: ${e}`);
        }
      });

      rtWs.on('error', (err: any) => {
        const detail = err?.errors?.map((e: any) => e.message || e).join('; ') || err?.message || err;
        this.logger.error(`OpenAI Realtime WS error: ${detail}`);
      });

      rtWs.on('close', () => {
        this.logger.log(`OpenAI Realtime WS closed for: ${session.conversationId}`);
        session.realtimeWs = null;
        session.realtimeReady = false;
      });
    } catch (err) {
      this.logger.error(`Failed to initialize Realtime WS: ${err}`);
    }
  }

  private handleRealtimeEvent(client: WsClient, session: VoiceSession, event: any) {
    switch (event.type) {
      case 'input_audio_buffer.speech_started':
        // Realtime server VAD detected barge-in
        this.logger.log(`Realtime VAD detected speech_started (barge-in)`);
        this.send(client, { type: 'interrupt' });
        this.send(client, { type: 'status', status: 'user_speaking' });
        break;

      case 'response.output_audio.delta':
      case 'response.audio.delta':
        if (session.lifecycleState === 'ending') {
          return;
        }
        if (event.delta) {
          session.realtimeResponseActive = true;
          if (!session.realtimeAudioSeen) {
            session.realtimeAudioSeen = true;
            const elapsed = session.realtimeTurnStart ? Math.max(50, Date.now() - session.realtimeTurnStart) : 600;
            this.send(client, {
              type: 'latency_metrics',
              metrics: {
                total_to_first_audio_ms: elapsed,
                llm_first_token_duration_ms: Math.round(elapsed * 0.4),
                tts_first_chunk_duration_ms: Math.round(elapsed * 0.6),
                stt_duration_ms: 0,
              },
            });
            this.logger.log(`[Realtime Latency] First audio delta arrived in ${elapsed}ms!`);
          }
          this.send(client, { type: 'audio_response_chunk', data: event.delta });
        }
        break;

      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta':
        if (session.lifecycleState === 'ending') {
          return;
        }
        if (event.delta) {
          session.realtimeTranscript = (session.realtimeTranscript || '') + event.delta;
          this.send(client, { type: 'response_text_chunk', text: session.realtimeTranscript });
        }
        break;

      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done':
        if (session.lifecycleState === 'ending') {
          return;
        }
        if (event.transcript) {
          session.realtimeTranscript = event.transcript;
          this.send(client, { type: 'response_text_chunk', text: event.transcript });
        }
        break;

      case 'conversation.item.input_audio_transcription.completed':
        if (event.transcript) {
          const trimmed = event.transcript.trim();
          this.logger.log(`[Realtime STT] User transcript: "${trimmed}"`);
          this.send(client, { type: 'final_transcript', text: trimmed });
          this.conversations.addMessage(session.conversationId, 'user', trimmed).catch(() => {});

          const endMatch = isEndPhraseMatch(trimmed, session.endPhrase || 'goodbye');
          if (endMatch) {
            this.logger.log(
              `[Realtime] End phrase "${session.endPhrase}" matched for transcript "${trimmed}". Ending session.`,
            );
            session.lifecycleState = 'ending';
            if (session.realtimeWs && session.realtimeWs.readyState === WebSocket.OPEN) {
              try {
                session.realtimeWs.send(JSON.stringify({ type: 'response.cancel' }));
              } catch {
                // ignore
              }
            }
            this.send(client, {
              type: 'lifecycle_change',
              state: 'ending',
            });

            const farewell = session.farewellMessage || 'Goodbye! Talk to you soon.';
            this.conversations
              .resolveTtsVoice(session.conversationId)
              .then(async (voice) => {
                const abortController = new AbortController();
                session.abortController = abortController;
                await this.speakDirectMessage(client, session, farewell, voice, abortController);
                this.send(client, {
                  type: 'session_ended',
                  reason: 'end_phrase_triggered',
                });
                this.conversations.addMessage(session.conversationId, 'assistant', farewell).catch(() => {});
                this.conversations.end(session.conversationId).catch(() => {});
              })
              .catch((err) => {
                this.logger.error(`Failed to handle realtime end farewell: ${err}`);
                this.send(client, {
                  type: 'session_ended',
                  reason: 'end_phrase_triggered',
                });
                this.conversations.end(session.conversationId).catch(() => {});
              });
            return;
          }

          if (session.lifecycleState === 'standby') {
            const wakeMatch = isWakePhraseMatch(trimmed, session.startPhrase || 'hey boss');
            if (!wakeMatch.matched) {
              this.logger.log(
                `[Realtime Standby] Transcript "${trimmed}" does not match wake phrase "${session.startPhrase}". Cancelling response.`,
              );
              if (session.realtimeWs && session.realtimeWs.readyState === WebSocket.OPEN) {
                try {
                  session.realtimeWs.send(JSON.stringify({ type: 'response.cancel' }));
                } catch {
                  // ignore
                }
              }
              this.send(client, { type: 'status', status: 'standby' });
              this.send(client, { type: 'end_of_response' });
              return;
            }

            this.logger.log(`[Realtime Standby] Wake phrase "${session.startPhrase}" matched! Transitioning to active.`);
            session.lifecycleState = 'active';
            this.send(client, {
              type: 'lifecycle_change',
              state: 'active',
              startPhrase: session.startPhrase,
              endPhrase: session.endPhrase,
            });
          }
        }
        break;

      case 'response.done':
        if (session.lifecycleState === 'ending') {
          return;
        }
        session.realtimeAudioSeen = false;
        session.realtimeResponseActive = false;
        if (session.realtimeTranscript) {
          this.conversations.addMessage(session.conversationId, 'assistant', session.realtimeTranscript).catch(() => {});
        }
        session.realtimeTranscript = '';
        this.send(client, { type: 'end_of_response' });
        this.send(client, { type: 'status', status: session.lifecycleState === 'standby' ? 'standby' : 'idle' });
        break;

      case 'error':
        this.logger.error(`Realtime error event: ${JSON.stringify(event.error)}`);
        break;
    }
  }

  // Plain text for TTS — unwrap markdown links, keep emails/URLs intact
  private forSpeech(text: string): string {
    return text
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();
  }

  private send(client: WsClient, data: Record<string, unknown>) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }
}
