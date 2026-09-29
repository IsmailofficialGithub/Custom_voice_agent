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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebSocket = require('ws');

interface VoiceSession {
  conversationId: string;
  authenticated: boolean;
  audioChunks: Buffer[];
  abortController?: AbortController | null;
  realtimeWs?: any;
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

  handleConnection(client: WsClient, req: { url?: string; headers: Record<string, string | string[] | undefined> }) {
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

    const session: VoiceSession = {
      conversationId,
      authenticated: true,
      audioChunks: [],
      abortController: null,
      realtimeWs: null,
    };

    this.sessions.set(client, session);
    this.logger.log(`Voice session connected: ${conversationId}`);

    // If Realtime engine feature flag is active, initialize OpenAI Realtime connection
    const voiceEngine = (this.config.get<string>('VOICE_ENGINE') || 'pipeline').toLowerCase();
    if (voiceEngine === 'realtime') {
      this.initRealtimeSession(client, session);
    }

    // Persist session metadata in Redis with 10 min TTL
    this.redisService.setSession(conversationId, { authenticated: true, connectedAt: Date.now() }, 600).catch(() => {});

    this.send(client, { type: 'connected', conversationId, engine: voiceEngine });
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
  handleMessageDecorator(@ConnectedSocket() client: WsClient, @MessageBody() data: unknown) {
    this.processIncomingData(client, data as Buffer | string);
  }

  @SubscribeMessage('text_message')
  handleTextMessageDecorator(@ConnectedSocket() client: WsClient, @MessageBody() data: unknown) {
    const text = typeof data === 'string' ? data : (data as { text?: string })?.text;
    this.processIncomingData(client, { type: 'text_message', text });
  }

  @SubscribeMessage('audio_chunk')
  handleAudioChunkDecorator(@ConnectedSocket() client: WsClient, @MessageBody() data: unknown) {
    const chunk = typeof data === 'string' ? data : (data as { data?: string })?.data;
    this.processIncomingData(client, { type: 'audio_chunk', data: chunk });
  }

  @SubscribeMessage('end_of_turn')
  handleEndOfTurnDecorator(@ConnectedSocket() client: WsClient) {
    this.processIncomingData(client, { type: 'end_of_turn' });
  }

  @SubscribeMessage('interrupt')
  handleInterruptDecorator(@ConnectedSocket() client: WsClient) {
    this.processIncomingData(client, { type: 'interrupt' });
  }

  private processIncomingData(client: WsClient, rawData: Buffer | string | Record<string, unknown>) {
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
              if (session.realtimeWs && session.realtimeWs.readyState === WebSocket.OPEN) {
                session.realtimeWs.send(
                  JSON.stringify({
                    type: 'input_audio_buffer.append',
                    audio: base64Str.trim(),
                  }),
                );
              }
            }
          }
          break;

        case 'end_of_turn':
          if (session.realtimeWs && session.realtimeWs.readyState === WebSocket.OPEN) {
            // Realtime server VAD handles commit, but explicit commit can be triggered
            session.realtimeWs.send(JSON.stringify({ type: 'input_audio_buffer.commit' }));
            session.realtimeWs.send(JSON.stringify({ type: 'response.create' }));
            return;
          }

          this.handleEndOfTurn(client, session, msg.speech_end).catch((err) => {
            this.logger.error(`End of turn processing error: ${err}`);
            this.send(client, { type: 'error', message: 'Failed to process voice turn' });
          });
          break;

        case 'interrupt':
          this.handleInterrupt(client, session);
          break;

        case 'text_message':
          this.handleTextMessage(client, session, msg.text ?? '').catch((err) => {
            this.logger.error(`Text message error: ${err}`);
            this.send(client, { type: 'error', message: 'Failed to process message' });
          });
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

    if (session.realtimeWs && session.realtimeWs.readyState === WebSocket.OPEN) {
      session.realtimeWs.send(JSON.stringify({ type: 'response.cancel' }));
    }

    this.send(client, { type: 'interrupted' });
    this.send(client, { type: 'status', status: 'idle' });
  }

  private async handleEndOfTurn(client: WsClient, session: VoiceSession, clientSpeechEndTime?: number) {
    const speechEndTime = clientSpeechEndTime ?? Date.now();

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
      this.send(client, { type: 'status', status: 'idle' });
      this.send(client, { type: 'end_of_response' });
      return;
    }

    this.send(client, { type: 'final_transcript', text: transcript });

    // 2. Stream LLM tokens -> Sentence boundary detection -> Immediate TTS chunk generation
    this.send(client, { type: 'status', status: 'thinking' });

    let llmFirstTokenTime = 0;
    let ttsFirstByteTime = 0;
    let cumulativeSpoken = '';
    const voice = await this.conversations.resolveTtsVoice(session.conversationId);

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
                // Send stage latency metrics so developer can measure every step
                this.send(client, {
                  type: 'latency_metrics',
                  metrics: {
                    speech_end: speechEndTime,
                    stt_done: sttDoneTime,
                    llm_first_token: llmFirstTokenTime,
                    tts_first_byte: ttsFirstByteTime,
                    total_to_first_audio_ms: ttsFirstByteTime - speechEndTime,
                    stt_duration_ms: sttDoneTime - speechEndTime,
                    llm_first_token_duration_ms: llmFirstTokenTime - sttDoneTime,
                    tts_first_chunk_duration_ms: ttsFirstByteTime - llmFirstTokenTime,
                  },
                });
                this.logger.log(
                  `Latency metrics: STT=${sttDoneTime - speechEndTime}ms, LLM_first=${llmFirstTokenTime - sttDoneTime}ms, TTS_first=${ttsFirstByteTime - llmFirstTokenTime}ms, Total=${ttsFirstByteTime - speechEndTime}ms`,
                );
              }

              cumulativeSpoken += (cumulativeSpoken ? ' ' : '') + sentence;
              this.send(client, { type: 'response_text_chunk', text: cumulativeSpoken });
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
    this.send(client, { type: 'status', status: 'thinking' });

    const voice = await this.conversations.resolveTtsVoice(session.conversationId);
    let cumulativeSpoken = '';

    try {
      await this.orchestrator.handleTextTurnStream(
        session.conversationId,
        text,
        {
          onSentence: async (sentence) => {
            if (abortController.signal.aborted) return;
            const spokenChunk = this.forSpeech(sentence);
            if (!spokenChunk) return;

            try {
              this.send(client, { type: 'status', status: 'generating_speech' });
              const audioBase64 = await this.ttsService.generateSpeechBase64(spokenChunk, voice, abortController.signal);
              if (abortController.signal.aborted) return;

              cumulativeSpoken += (cumulativeSpoken ? ' ' : '') + sentence;
              this.send(client, { type: 'response_text_chunk', text: cumulativeSpoken });
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

  // OpenAI Realtime API session initialization (Feature Flag: VOICE_ENGINE=realtime)
  private initRealtimeSession(client: WsClient, session: VoiceSession) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) {
      this.logger.error('OPENAI_API_KEY not found for Realtime API');
      return;
    }
    const realtimeModel = this.config.get<string>('OPENAI_REALTIME_MODEL') || 'gpt-4o-realtime-preview';
    const wsUrl = `wss://api.openai.com/v1/realtime?model=${realtimeModel}`;

    try {
      const rtWs = new WebSocket(wsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      session.realtimeWs = rtWs;

      rtWs.on('open', () => {
        this.logger.log(`OpenAI Realtime session connected for: ${session.conversationId}`);
        const sessionUpdate = {
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            voice: 'alloy',
            input_audio_format: 'pcm16',
            output_audio_format: 'pcm16',
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 400,
            },
          },
        };
        rtWs.send(JSON.stringify(sessionUpdate));
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
        this.logger.error(`OpenAI Realtime WS error: ${err}`);
      });

      rtWs.on('close', () => {
        this.logger.log(`OpenAI Realtime WS closed for: ${session.conversationId}`);
        session.realtimeWs = null;
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

      case 'response.audio.delta':
        if (event.delta) {
          this.send(client, { type: 'audio_response_chunk', data: event.delta });
        }
        break;

      case 'response.audio_transcript.delta':
        if (event.delta) {
          this.send(client, { type: 'response_text_chunk', text: event.delta });
        }
        break;

      case 'response.done':
        this.send(client, { type: 'end_of_response' });
        this.send(client, { type: 'status', status: 'idle' });
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
