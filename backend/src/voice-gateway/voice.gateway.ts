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

// eslint-disable-next-line @typescript-eslint/no-require-imports
const WebSocket = require('ws');

interface VoiceSession {
  conversationId: string;
  authenticated: boolean;
  audioChunks: Buffer[];
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
  ) {}

  handleConnection(client: WsClient, req: { url?: string; headers: Record<string, string | string[] | undefined> }) {
    const url = req.url ?? '';
    const urlParams = new URLSearchParams(url.split('?')[1] ?? '');
    const match = url.match(/\/api\/v1\/voice\/([^?]+)/);
    const conversationId = urlParams.get('conversationId') ?? match?.[1];

    const apiKey = urlParams.get('apiKey') ?? req.headers['x-api-key'];
    const validKey = this.config.get<string>('API_KEY');

    if (apiKey !== validKey || !conversationId) {
      this.send(client, { type: 'error', message: 'Unauthorized or missing conversation ID' });
      client.close(1008, 'Unauthorized');
      return;
    }

    this.sessions.set(client, { conversationId, authenticated: true, audioChunks: [] });
    this.logger.log(`Voice session connected: ${conversationId}`);

    // Persist session metadata in Redis with 10 min TTL
    this.redisService.setSession(conversationId, { authenticated: true, connectedAt: Date.now() }, 600).catch(() => {});

    this.send(client, { type: 'connected', conversationId });
  }

  handleDisconnect(client: WsClient) {
    const session = this.sessions.get(client);
    if (session) {
      this.logger.log(`Voice session disconnected: ${session.conversationId}`);
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

  private processIncomingData(client: WsClient, rawData: Buffer | string | Record<string, unknown>) {
    try {
      const session = this.sessions.get(client);
      if (!session?.authenticated) {
        this.send(client, { type: 'error', message: 'Not authenticated' });
        return;
      }

      // Binary frames that look like JSON (e.g. UTF-8 Nest WS packets) must be
      // parsed as messages — never pushed as raw audio. True audio starts with
      // RIFF / OggS / WebM magic bytes, not '{'.
      if (Buffer.isBuffer(rawData)) {
        if (rawData.length > 0 && rawData[0] === 0x7b /* '{' */) {
          rawData = rawData.toString('utf8');
        } else {
          session.audioChunks.push(rawData);
          const base64 = rawData.toString('base64');
          this.redisService.pushAudioChunk(session.conversationId, base64).catch(() => {});
          return;
        }
      }

      let msg: { type: string; data?: string; text?: string };
      if (typeof rawData === 'string') {
        const parsed = JSON.parse(rawData);
        msg = parsed.data && typeof parsed.data === 'object' && parsed.data.type ? parsed.data : parsed;
      } else if (typeof rawData === 'object' && rawData !== null) {
        const obj = rawData as Record<string, unknown>;
        msg = obj.data && typeof obj.data === 'object' && (obj.data as Record<string, unknown>).type
          ? (obj.data as { type: string; data?: string; text?: string })
          : (rawData as { type: string; data?: string; text?: string });
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
              this.logger.log(`Received audio chunk (${audioBuf.length} bytes, header hex: ${audioBuf.subarray(0, 8).toString('hex').toUpperCase()})`);
              session.audioChunks.push(audioBuf);
              this.redisService.pushAudioChunk(session.conversationId, base64Str).catch(() => {});
            }
          }
          break;

        case 'end_of_turn':
          this.handleEndOfTurn(client, session).catch((err) => {
            this.logger.error(`End of turn processing error: ${err}`);
            this.send(client, { type: 'error', message: 'Failed to process voice turn' });
          });
          break;

        case 'text_message':
          this.handleTextMessage(client, session.conversationId, msg.text ?? '').catch((err) => {
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

  private async handleEndOfTurn(client: WsClient, session: VoiceSession) {
    // Rate Limiting Check: Max 30 voice turns per minute per session
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
      this.logger.warn(
        `Audio buffer has unexpected header (${headerHex}), skipping transcription to avoid invalid STT payload`,
      );
      this.send(client, { type: 'error', message: 'Could not transcribe speech. Please try speaking again.' });
      this.send(client, { type: 'status', status: 'idle' });
      this.send(client, { type: 'end_of_response' });
      return;
    }

    // 1. Transcribe audio via STT
    this.send(client, { type: 'status', status: 'transcribing' });
    let transcript = '';
    try {
      transcript = await this.sttService.transcribeBuffer(combinedAudio);
    } catch (err: any) {
      this.logger.warn(`STT transcription skipped or failed: ${err.message || err}`);
      this.send(client, { type: 'error', message: 'Could not transcribe speech. Please try speaking again.' });
      this.send(client, { type: 'status', status: 'idle' });
      this.send(client, { type: 'end_of_response' });
      return;
    }

    if (!transcript || transcript.trim().length === 0) {
      this.send(client, { type: 'status', status: 'idle' });
      this.send(client, { type: 'end_of_response' });
      return;
    }

    this.send(client, { type: 'final_transcript', text: transcript });

    // 2. Process turn via Orchestrator
    this.send(client, { type: 'status', status: 'thinking' });
    const response = await this.orchestrator.handleTextTurn(session.conversationId, transcript);

    // 3. Speak in short chunks so audio starts ASAP (text arrives with each chunk)
    await this.speakResponse(client, session.conversationId, response.content);
  }

  private async handleTextMessage(client: WsClient, conversationId: string, text: string) {
    // Rate Limiting Check
    const limit = this.config.get<number>('VOICE_RATE_LIMIT_TURNS', 30);
    const windowSec = this.config.get<number>('VOICE_RATE_LIMIT_WINDOW_SEC', 60);
    const rateCheck = await this.redisService.checkRateLimit(conversationId, limit, windowSec);

    if (!rateCheck.allowed) {
      this.send(client, {
        type: 'error',
        message: `Rate limit exceeded: You have reached the maximum allowed ${limit} turns per minute. Please wait.`,
      });
      return;
    }

    // Echo once as final transcript (UI dedupes if it already showed the typed line)
    this.send(client, { type: 'final_transcript', text });

    this.send(client, { type: 'status', status: 'thinking' });
    const response = await this.orchestrator.handleTextTurn(conversationId, text);
    await this.speakResponse(client, conversationId, response.content);
  }

  /**
   * Stream reply: full text once for the UI, then TTS in speakable chunks.
   * Emails/URLs are protected so periods inside them are not treated as sentence ends.
   */
  private async speakResponse(client: WsClient, conversationId: string, content: string) {
    const text = (content || '').trim();
    if (!text) {
      this.send(client, { type: 'end_of_response' });
      return;
    }

    const voice = await this.conversations.resolveTtsVoice(conversationId);
    this.send(client, { type: 'status', status: 'generating_speech' });

    // Full answer to UI first (avoids "com." fragments from email/URL splits)
    this.send(client, { type: 'response_text_chunk', text });

    const spoken = this.forSpeech(text);
    const chunks = this.splitIntoSpeakableChunks(spoken);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      try {
        const audioBase64 = await this.ttsService.generateSpeechBase64(chunk, voice);
        this.send(client, { type: 'audio_response_chunk', data: audioBase64 });
      } catch (err) {
        this.logger.warn(`TTS generation failed for chunk ${i + 1}/${chunks.length}: ${err}`);
      }
    }

    this.send(client, { type: 'end_of_response' });
  }

  /** Plain text for TTS — unwrap markdown links, keep emails/URLs intact */
  private forSpeech(text: string): string {
    return text
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .trim();
  }

  private splitIntoSpeakableChunks(text: string, maxLen = 160): string[] {
    const placeholders: string[] = [];
    const protect = (match: string) => {
      const key = `⟦${placeholders.length}⟧`;
      placeholders.push(match);
      return key;
    };

    // Protect emails & URLs so "." inside them does not end a sentence
    let protectedText = text
      .replace(/https?:\/\/[^\s<>)"']+/gi, protect)
      .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, protect);

    const sentences =
      protectedText
        .match(/[^.!?]+[.!?]+(?:["')\]]*)?(?:\s+|$)|[^.!?]+$/g)
        ?.map((s) => s.trim())
        .filter(Boolean) ?? [protectedText];

    const restore = (s: string) =>
      s.replace(/⟦(\d+)⟧/g, (_, i) => placeholders[Number(i)] ?? '');

    const chunks: string[] = [];
    let buffer = '';
    for (const raw of sentences) {
      const sentence = restore(raw);
      if (!buffer) {
        buffer = sentence;
        continue;
      }
      if (`${buffer} ${sentence}`.length <= maxLen) {
        buffer = `${buffer} ${sentence}`;
      } else {
        chunks.push(buffer);
        buffer = sentence;
      }
    }
    if (buffer) chunks.push(buffer);
    return chunks.length > 0 ? chunks : [text];
  }

  private send(client: WsClient, data: Record<string, unknown>) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  }
}
