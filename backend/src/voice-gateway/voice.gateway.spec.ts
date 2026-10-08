import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceGateway } from './voice.gateway';

describe('VoiceGateway - Lifecycle & Start/End Phrases', () => {
  let gateway: VoiceGateway;
  let mockConfig: any;
  let mockOrchestrator: any;
  let mockConversations: any;
  let mockStt: any;
  let mockTts: any;
  let mockRedis: any;
  let mockAuth: any;
  let mockClient: any;
  let sentMessages: any[];

  beforeEach(() => {
    sentMessages = [];
    mockClient = {
      readyState: 1,
      send: vi.fn((data: string) => {
        sentMessages.push(JSON.parse(data));
      }),
      close: vi.fn(),
    };

    mockConfig = {
      get: vi.fn((key: string, defaultVal: any) => defaultVal),
    };

    mockOrchestrator = {
      handleTextTurnStream: vi.fn(),
    };

    mockConversations = {
      getConversationWithAgent: vi.fn().mockResolvedValue({
        id: 'conv-123',
        agent: {
          startPhrase: 'hey boss',
          endPhrase: 'goodbye',
          farewellMessage: 'Goodbye! Talk to you soon.',
          ttsVoice: 'alloy',
        },
      }),
      resolveTtsVoice: vi.fn().mockResolvedValue('alloy'),
      addMessage: vi.fn().mockResolvedValue({}),
      end: vi.fn().mockResolvedValue({}),
    };

    mockStt = {
      transcribeBuffer: vi.fn(),
    };

    mockTts = {
      generateSpeechBase64: vi.fn().mockResolvedValue('base64audio'),
    };

    mockRedis = {
      setSession: vi.fn().mockResolvedValue(true),
      deleteSession: vi.fn().mockResolvedValue(true),
      pushAudioChunk: vi.fn().mockResolvedValue(true),
      getAudioChunks: vi.fn().mockResolvedValue([]),
      clearAudioChunks: vi.fn().mockResolvedValue(true),
      checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
    };

    mockAuth = {
      isValidBearer: vi.fn().mockReturnValue(true),
    };

    gateway = new VoiceGateway(
      mockConfig,
      mockOrchestrator,
      mockConversations,
      mockStt,
      mockTts,
      mockRedis,
      mockAuth,
    );
  });

  it('initializes session in standby lifecycle state with agent start/end phrases', async () => {
    await gateway.handleConnection(mockClient, {
      url: '/api/v1/voice?conversationId=conv-123&apiKey=valid-key',
      headers: {},
    });

    const connectedMsg = sentMessages.find((m) => m.type === 'connected');
    expect(connectedMsg).toBeDefined();
    expect(connectedMsg.lifecycleState).toBe('standby');
    expect(connectedMsg.startPhrase).toBe('hey boss');
    expect(connectedMsg.endPhrase).toBe('goodbye');

    const lifecycleMsg = sentMessages.find((m) => m.type === 'lifecycle_change');
    expect(lifecycleMsg).toBeDefined();
    expect(lifecycleMsg.state).toBe('standby');
  });

  it('ignores speech in standby that does not match wake phrase and does not call LLM', async () => {
    await gateway.handleConnection(mockClient, {
      url: '/api/v1/voice?conversationId=conv-123&apiKey=valid-key',
      headers: {},
    });
    sentMessages = [];

    // Send valid WAV header audio chunk
    const fakeWav = Buffer.alloc(1200);
    fakeWav.write('RIFF', 0);
    fakeWav.write('WAVE', 8);

    mockStt.transcribeBuffer.mockResolvedValue('What is the weather today?');

    gateway.handleMessageDecorator(
      mockClient,
      JSON.stringify({ type: 'audio_chunk', data: fakeWav.toString('base64') }),
    );
    await gateway.handleEndOfTurnDecorator(mockClient);

    expect(mockStt.transcribeBuffer).toHaveBeenCalled();
    expect(mockOrchestrator.handleTextTurnStream).not.toHaveBeenCalled();

    const standbyStatus = sentMessages.find((m) => m.type === 'status' && m.status === 'standby');
    expect(standbyStatus).toBeDefined();
    const endMsg = sentMessages.find((m) => m.type === 'end_of_response');
    expect(endMsg).toBeDefined();
  });

  it('activates session on standalone wake phrase and speaks greeting without calling LLM', async () => {
    await gateway.handleConnection(mockClient, {
      url: '/api/v1/voice?conversationId=conv-123&apiKey=valid-key',
      headers: {},
    });
    sentMessages = [];

    const fakeWav = Buffer.alloc(1200);
    fakeWav.write('RIFF', 0);
    fakeWav.write('WAVE', 8);

    mockStt.transcribeBuffer.mockResolvedValue('Hey boss!');

    gateway.handleMessageDecorator(
      mockClient,
      JSON.stringify({ type: 'audio_chunk', data: fakeWav.toString('base64') }),
    );
    await gateway.handleEndOfTurnDecorator(mockClient);

    expect(mockOrchestrator.handleTextTurnStream).not.toHaveBeenCalled();
    expect(mockTts.generateSpeechBase64).toHaveBeenCalled();

    const activeLifecycle = sentMessages.find(
      (m) => m.type === 'lifecycle_change' && m.state === 'active',
    );
    expect(activeLifecycle).toBeDefined();
  });

  it('activates session on combined wake phrase + command and forwards remainder to LLM', async () => {
    await gateway.handleConnection(mockClient, {
      url: '/api/v1/voice?conversationId=conv-123&apiKey=valid-key',
      headers: {},
    });
    sentMessages = [];

    const fakeWav = Buffer.alloc(1200);
    fakeWav.write('RIFF', 0);
    fakeWav.write('WAVE', 8);

    mockStt.transcribeBuffer.mockResolvedValue('Hey boss, tell me a quick joke');

    gateway.handleMessageDecorator(
      mockClient,
      JSON.stringify({ type: 'audio_chunk', data: fakeWav.toString('base64') }),
    );
    await gateway.handleEndOfTurnDecorator(mockClient);

    const activeLifecycle = sentMessages.find(
      (m) => m.type === 'lifecycle_change' && m.state === 'active',
    );
    expect(activeLifecycle).toBeDefined();

    expect(mockOrchestrator.handleTextTurnStream).toHaveBeenCalledWith(
      'conv-123',
      'tell me a quick joke',
      expect.anything(),
      expect.anything(),
    );
  });

  it('ends session when user says end phrase in active state', async () => {
    await gateway.handleConnection(mockClient, {
      url: '/api/v1/voice?conversationId=conv-123&apiKey=valid-key',
      headers: {},
    });

    const fakeWav = Buffer.alloc(1200);
    fakeWav.write('RIFF', 0);
    fakeWav.write('WAVE', 8);

    // Turn 1: Wake up
    mockStt.transcribeBuffer.mockResolvedValue('Hey boss');
    gateway.handleMessageDecorator(
      mockClient,
      JSON.stringify({ type: 'audio_chunk', data: fakeWav.toString('base64') }),
    );
    await gateway.handleEndOfTurnDecorator(mockClient);

    sentMessages = [];

    // Turn 2: User says Goodbye
    mockStt.transcribeBuffer.mockResolvedValue('Okay goodbye');
    gateway.handleMessageDecorator(
      mockClient,
      JSON.stringify({ type: 'audio_chunk', data: fakeWav.toString('base64') }),
    );
    await gateway.handleEndOfTurnDecorator(mockClient);

    expect(mockOrchestrator.handleTextTurnStream).not.toHaveBeenCalled();
    expect(mockTts.generateSpeechBase64).toHaveBeenCalledWith(
      'Goodbye! Talk to you soon.',
      'alloy',
      expect.anything(),
    );

    const sessionEnded = sentMessages.find(
      (m) => m.type === 'session_ended' && m.reason === 'end_phrase_triggered',
    );
    expect(sessionEnded).toBeDefined();
    expect(mockConversations.end).toHaveBeenCalledWith('conv-123');
  });

  it('ends session immediately when user says phonetic goodbye like "Good boy" even from standby', async () => {
    await gateway.handleConnection(mockClient, {
      url: '/api/v1/voice?conversationId=conv-123&apiKey=valid-key',
      headers: {},
    });
    sentMessages = [];

    const fakeWav = Buffer.alloc(1200);
    fakeWav.write('RIFF', 0);
    fakeWav.write('WAVE', 8);

    mockStt.transcribeBuffer.mockResolvedValue('Good boy.');
    gateway.handleMessageDecorator(
      mockClient,
      JSON.stringify({ type: 'audio_chunk', data: fakeWav.toString('base64') }),
    );
    await gateway.handleEndOfTurnDecorator(mockClient);

    expect(mockOrchestrator.handleTextTurnStream).not.toHaveBeenCalled();
    expect(mockTts.generateSpeechBase64).toHaveBeenCalled();

    const sessionEnded = sentMessages.find(
      (m) => m.type === 'session_ended' && m.reason === 'end_phrase_triggered',
    );
    expect(sessionEnded).toBeDefined();
    expect(mockConversations.end).toHaveBeenCalledWith('conv-123');
  });
});
