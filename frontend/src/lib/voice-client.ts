// Real-Time Voice WebSocket Client
// Continuous PCM capture (pre-roll + speech window) → 16kHz WAV for Whisper
// Fast endpointing for lower turn latency

export type VoiceState =
  | 'idle'
  | 'standby'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'user_speaking'
  | 'silence_detected'
  | 'transcribing'
  | 'thinking'
  | 'speaking'
  | 'generating_speech'
  | 'disconnected'
  | 'error';

export interface VoiceEventHandlers {
  onConnected?: (conversationId: string) => void;
  onPartialTranscript?: (text: string) => void;
  onFinalTranscript?: (text: string) => void;
  onResponseTextChunk?: (text: string) => void;
  onAudioResponseChunk?: (base64Audio: string) => void;
  onStatusChange?: (status: VoiceState) => void;
  onError?: (error: string) => void;
  onAudioLevelChange?: (level: number) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: () => void;
  onLatencyMetrics?: (metrics: Record<string, number>) => void;
  onLifecycleChange?: (state: 'standby' | 'active' | 'ending', startPhrase?: string, endPhrase?: string) => void;
  onSessionEnded?: (reason: string) => void;
}

export class VoiceSessionClient {
  private ws: WebSocket | null = null;
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaSource: MediaStreamAudioSourceNode | null = null;
  private scriptProcessor: ScriptProcessorNode | null = null;
  private keepAliveGain: GainNode | null = null;

  private animFrameId: number | null = null;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;
  private turnTimeoutTimer: ReturnType<typeof setTimeout> | null = null;

  private currentAudioElement: HTMLAudioElement | null = null;
  private currentSourceNode: AudioBufferSourceNode | null = null;
  private currentState: VoiceState = 'idle';

  // When true: no mic capture, no audio send. Typed messages still work.
  private isPaused = false;
  private isProcessingTurn = false;
  private isCapturing = false;
  private speechStartTime = 0;

  private listeningEpoch = 0;
  private pendingEpoch = 0;

  private audioQueue: string[] = [];
  private isPlayingQueue = false;
  private endOfResponseReceived = false;

  // Always-on short pre-roll so we don't clip the start of speech
  private preRoll: Float32Array[] = [];
  private captureChunks: Float32Array[] = [];
  private preRollSamples = 0;
  private captureSamples = 0;

  // VAD — tuned for natural human conversation & echo suppression
  // VAD — adaptive energy tracking & echo suppression
  private readonly bargeInThreshold = 75;
  private readonly silenceDurationMs = 1200;
  private readonly minSpeechDurationMs = 250;
  private readonly preRollMs = 600;
  private readonly speechOnsetNeeded = 4;
  private speechOnsetFrames = 0;
  private bargeInFrames = 0;
  private readonly bargeInOnsetNeeded = 8;
  private latestRms = 0;
  private ambientNoiseFloorRms = 0.003;
  private ambientNoiseFloorLevel = 10;
  private echoCooldownUntil = 0;
  private startupGraceUntil = 0;
  private vadMode: 'auto' | 'manual' = 'auto';
  private isManualRecording = false;

  private lifecycleState: 'standby' | 'active' | 'ending' = 'standby';
  private startPhrase = 'hey boss';
  private endPhrase = 'goodbye';

  constructor(
    private readonly conversationId: string,
    private readonly apiKey: string,
    private readonly handlers: VoiceEventHandlers,
    private readonly wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3002/api/v1/voice',
  ) {}

  public get state(): VoiceState {
    return this.currentState;
  }

  public get lifecycle(): 'standby' | 'active' | 'ending' {
    return this.lifecycleState;
  }

  public get agentStartPhrase(): string {
    return this.startPhrase;
  }

  public get agentEndPhrase(): string {
    return this.endPhrase;
  }

  public get muted(): boolean {
    return this.isPaused;
  }

  public get paused(): boolean {
    return this.isPaused;
  }

  public get isRecording(): boolean {
    return this.currentState === 'user_speaking';
  }

  public setVadMode(mode: 'auto' | 'manual') {
    this.vadMode = mode;
    if (mode === 'manual' && this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  public getVadMode(): 'auto' | 'manual' {
    return this.vadMode;
  }

  public startManualRecording() {
    if (this.isPaused) return;
    this.stopCurrentAudio(true);
    this.isPlayingQueue = false;
    this.audioQueue = [];
    this.echoCooldownUntil = 0;
    this.clearTurnSafetyTimeout();
    this.isProcessingTurn = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    this.isManualRecording = true;
    this.speechStartTime = Date.now();
    this.beginCapture();
    this.updateState('user_speaking');
    this.handlers.onSpeechStart?.();
  }

  public async stopManualRecordingAndSend() {
    this.isManualRecording = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.isPaused) {
      this.endCapture();
      this.resetTurnToListening();
      return;
    }
    const chunks = this.endCapture();
    if (chunks.length === 0) {
      this.resetTurnToListening();
      return;
    }
    const sampleRate = this.audioContext?.sampleRate || 48000;
    const wavBlob = this.encodeWav24kMono(chunks, sampleRate);
    console.log(`[VoiceClient] Manual recording stopped: chunks=${chunks.length}, size=${wavBlob.size}`);
    if (wavBlob.size > 200) {
      this.updateState('silence_detected');
      this.handlers.onSpeechEnd?.();
      this.isProcessingTurn = true;
      await this.sendAudioTurn(wavBlob);
    } else {
      this.resetTurnToListening();
    }
  }

  public cancelManualRecording() {
    this.isManualRecording = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.endCapture();
    this.resetTurnToListening();
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.updateState('connecting');
        const url = `${this.wsUrl}?conversationId=${this.conversationId}&apiKey=${encodeURIComponent(this.apiKey)}`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => this.updateState('connected');

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this.handleIncomingMessage(msg, resolve);
          } catch (err) {
            console.error('Failed to parse WS payload', err);
          }
        };

        this.ws.onerror = (err) => {
          this.updateState('error');
          this.handlers.onError?.('WebSocket connection error');
          reject(err);
        };

        this.ws.onclose = () => this.updateState('disconnected');
      } catch (err) {
        this.updateState('error');
        reject(err);
      }
    });
  }

  private isStaleResponse(): boolean {
    return this.pendingEpoch !== this.listeningEpoch;
  }

  private handleIncomingMessage(
    msg: {
      type: string;
      conversationId?: string;
      text?: string;
      data?: string;
      status?: VoiceState;
      message?: string;
      state?: 'standby' | 'active' | 'ending';
      lifecycleState?: 'standby' | 'active' | 'ending';
      startPhrase?: string;
      endPhrase?: string;
      reason?: string;
    },
    resolve: () => void,
  ) {
    switch (msg.type) {
      case 'connected':
        if (msg.lifecycleState) {
          this.lifecycleState = msg.lifecycleState;
        }
        if (msg.startPhrase) this.startPhrase = msg.startPhrase;
        if (msg.endPhrase) this.endPhrase = msg.endPhrase;
        if (this.lifecycleState === 'standby' && this.currentState !== 'idle') {
          this.updateState('standby');
        }
        if (msg.conversationId) {
          this.handlers.onConnected?.(msg.conversationId);
          resolve();
        }
        break;
      case 'lifecycle_change':
        if (msg.state) {
          this.lifecycleState = msg.state;
        }
        if (msg.startPhrase) this.startPhrase = msg.startPhrase;
        if (msg.endPhrase) this.endPhrase = msg.endPhrase;
        if (this.lifecycleState === 'standby') {
          this.updateState('standby');
        } else if (this.lifecycleState === 'active') {
          if (this.currentState === 'standby') {
            this.updateState('listening');
          }
        }
        this.handlers.onLifecycleChange?.(this.lifecycleState, this.startPhrase, this.endPhrase);
        break;
      case 'session_ended':
        this.updateState('disconnected');
        this.handlers.onSessionEnded?.(msg.reason || 'end_phrase_triggered');
        setTimeout(() => {
          this.disconnect();
        }, 300);
        break;
      case 'partial_transcript':
        if (this.isStaleResponse()) return;
        if (msg.text) this.handlers.onPartialTranscript?.(msg.text);
        break;
      case 'final_transcript':
        if (this.isStaleResponse()) return;
        if (msg.text) {
          this.updateState('transcribing');
          this.handlers.onFinalTranscript?.(msg.text);
        }
        break;
      case 'response_text_chunk':
        if (this.isStaleResponse()) return;
        this.clearTurnSafetyTimeout();
        if (msg.text) {
          this.updateState('thinking');
          this.handlers.onResponseTextChunk?.(msg.text);
        }
        break;
      case 'audio_response_chunk':
        if (this.isStaleResponse()) return;
        this.clearTurnSafetyTimeout();
        if (msg.data) {
          this.handlers.onAudioResponseChunk?.(msg.data);
          this.enqueueAudio(msg.data);
        }
        break;
      case 'end_of_response':
        if (this.isStaleResponse()) return;
        this.endOfResponseReceived = true;
        if (!this.isPlayingQueue && this.audioQueue.length === 0) {
          this.resetTurnToListening();
        }
        break;
      case 'status':
        if (msg.status === 'idle') {
          if (!this.isStaleResponse() && !this.isPlayingQueue && this.audioQueue.length === 0) {
            this.resetTurnToListening();
          }
        } else if (msg.status) {
          if (this.isStaleResponse()) return;
          this.updateState(msg.status);
        }
        break;
      case 'latency_metrics':
        if ((msg as any).metrics) {
          console.log('[Voice Latency Metrics]', (msg as any).metrics);
          this.handlers.onLatencyMetrics?.((msg as any).metrics);
        }
        break;
      case 'interrupted':
      case 'interrupt':
        this.listeningEpoch += 1;
        this.stopCurrentAudio(true);
        this.isPlayingQueue = false;
        if (this.currentState !== 'user_speaking') {
          this.resetTurnToListening();
        }
        break;
      case 'error':
        if (!this.isStaleResponse()) {
          this.resetTurnToListening();
          if (msg.message) this.handlers.onError?.(msg.message);
        }
        break;
    }
  }

  async startCall(): Promise<void> {
    try {
      await this.initMicrophone();
      this.updateState(this.lifecycleState === 'standby' ? 'standby' : 'listening');
    } catch {
      this.updateState('error');
      this.handlers.onError?.('Microphone access denied or unsupported');
      throw new Error('Microphone init failed');
    }
  }

  private async initMicrophone(): Promise<void> {
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });

    const AudioContextClass =
      window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    try {
      this.audioContext = new AudioContextClass({ sampleRate: 24000 });
    } catch {
      try {
        this.audioContext = new AudioContextClass();
      } catch {
        this.audioContext = new AudioContextClass({ sampleRate: 48000 });
      }
    }
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => {});
    }

    // Auto-unlock AudioContext on first user interaction if blocked by browser autoplay policy
    const unlockAudio = () => {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('click', unlockAudio, { passive: true });
      window.addEventListener('keydown', unlockAudio, { passive: true });
      window.addEventListener('pointerdown', unlockAudio, { passive: true });
      window.addEventListener('touchstart', unlockAudio, { passive: true });
    }

    this.startupGraceUntil = Date.now() + 1500;
    this.mediaSource = this.audioContext.createMediaStreamSource(this.mediaStream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.3;
    this.mediaSource.connect(this.analyser);

    // Anti-aliasing low-pass filter at 11kHz so any downsampling to 24kHz has zero distortion
    const antiAliasFilter = this.audioContext.createBiquadFilter();
    antiAliasFilter.type = 'lowpass';
    antiAliasFilter.frequency.value = 11000;
    antiAliasFilter.Q.value = 0.707;
    this.mediaSource.connect(antiAliasFilter);

    // Continuous PCM — gain must be non-zero (1e-5) so Chrome never pauses or drops the ScriptProcessorNode
    const bufferSize = 2048;
    this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    this.keepAliveGain = this.audioContext.createGain();
    this.keepAliveGain.gain.value = 0.00001;

    this.scriptProcessor.onaudioprocess = (event) => {
      if (this.isPaused) return;
      const input = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);

      // Fast RMS computation on current audio frame
      let sumSq = 0;
      const step = 4;
      for (let i = 0; i < input.length; i += step) {
        const s = input[i];
        sumSq += s * s;
      }
      this.latestRms = Math.sqrt(sumSq / (input.length / step));

      // If we are actively capturing speech, NEVER discard audio frames!
      if (this.isCapturing) {
        this.captureChunks.push(copy);
        this.captureSamples += copy.length;
        return;
      }

      // When IDLE: do not accumulate pre-roll while assistant speech is actively playing through speakers
      const isEchoCooldown = Date.now() < this.echoCooldownUntil;
      if (this.isPlayingQueue || this.currentState === 'speaking' || isEchoCooldown) {
        this.preRoll = [];
        this.preRollSamples = 0;
        return;
      }

      this.preRoll.push(copy);
      this.preRollSamples += copy.length;
      const maxPre = Math.floor(((this.audioContext?.sampleRate || 48000) * this.preRollMs) / 1000);
      while (this.preRollSamples > maxPre && this.preRoll.length > 0) {
        const dropped = this.preRoll.shift();
        if (dropped) this.preRollSamples -= dropped.length;
      }
    };

    antiAliasFilter.connect(this.scriptProcessor);
    this.scriptProcessor.connect(this.keepAliveGain);
    this.keepAliveGain.connect(this.audioContext.destination);

    this.runVADLoop();
  }

  private beginCapture() {
    this.isCapturing = true;
    this.captureChunks = this.preRoll.length > 0 ? [...this.preRoll] : [];
    this.captureSamples = this.preRollSamples;
    this.preRoll = [];
    this.preRollSamples = 0;
  }

  private endCapture(): Float32Array[] {
    this.isCapturing = false;
    const chunks = this.captureChunks;
    this.captureChunks = [];
    this.captureSamples = 0;
    return chunks;
  }

  private runVADLoop() {
    if (!this.analyser) return;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

    const update = () => {
      if (!this.analyser) return;
      this.analyser.getByteFrequencyData(dataArray);

      // Focus on human vocal spectrum (~100Hz to ~5.5kHz, bins 2..128 of 512)
      let sum = 0;
      const voiceBinEnd = Math.min(dataArray.length, 128);
      const voiceBinCount = voiceBinEnd - 2;
      for (let i = 2; i < voiceBinEnd; i++) sum += dataArray[i];
      const voiceAvg = voiceBinCount > 0 ? sum / voiceBinCount : 0;
      const normalized = Math.min(100, Math.round((voiceAvg / 128) * 100));
      this.handlers.onAudioLevelChange?.(normalized);

      // Adaptively track ambient background noise floor when not in speech
      if (this.currentState === 'listening' || this.currentState === 'idle') {
        if (this.latestRms < 0.04) {
          this.ambientNoiseFloorRms = this.ambientNoiseFloorRms * 0.96 + this.latestRms * 0.04;
          this.ambientNoiseFloorLevel = this.ambientNoiseFloorLevel * 0.96 + normalized * 0.04;
        }
      }

      if (this.isPaused) {
        this.animFrameId = requestAnimationFrame(update);
        return;
      }

      // Barge-in is only allowed if user speaks VERY loudly right at mic to deliberately override
      if (this.currentState === 'speaking' || this.isPlayingQueue) {
        if (normalized >= this.bargeInThreshold && this.latestRms > 0.05) {
          this.bargeInFrames += 1;
          if (this.bargeInFrames >= this.bargeInOnsetNeeded) {
            this.bargeInFrames = 0;
            this.bargeIn();
          }
        } else {
          this.bargeInFrames = 0;
        }
      } else {
        this.bargeInFrames = 0;
      }

      // Run VAD capture ONLY when idle/listening and not playing speech audio or in echo cooldown
      const isEchoCooldown = Date.now() < this.echoCooldownUntil;
      if (!this.isProcessingTurn && !this.isPlayingQueue && this.currentState !== 'speaking' && !isEchoCooldown) {
        this.processVADLevel(normalized);
      }

      this.animFrameId = requestAnimationFrame(update);
    };

    update();
  }

  private startTurnSafetyTimeout() {
    this.clearTurnSafetyTimeout();
    this.turnTimeoutTimer = setTimeout(() => {
      if (this.isProcessingTurn || this.currentState === 'thinking' || this.currentState === 'transcribing') {
        console.warn('[VoiceClient] Turn response timed out after 10s. Resetting state to listening.');
        this.resetTurnToListening();
      }
    }, 10000);
  }

  private clearTurnSafetyTimeout() {
    if (this.turnTimeoutTimer) {
      clearTimeout(this.turnTimeoutTimer);
      this.turnTimeoutTimer = null;
    }
  }

  private resetTurnToListening() {
    this.clearTurnSafetyTimeout();
    this.isProcessingTurn = false;
    this.endOfResponseReceived = false;
    this.speechOnsetFrames = 0;
    this.isCapturing = false;
    this.captureChunks = [];
    this.captureSamples = 0;
    this.preRoll = [];
    this.preRollSamples = 0;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    if (this.currentState !== 'user_speaking') {
      this.updateState(this.lifecycleState === 'standby' ? 'standby' : 'listening');
    }
  }

  private bargeIn() {
    this.listeningEpoch += 1;
    this.stopCurrentAudio(true);
    this.isPlayingQueue = false;
    this.isProcessingTurn = false;
    this.endOfResponseReceived = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    // Immediately signal backend to abort in-flight LLM stream and TTS generation
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event: 'message', data: { type: 'interrupt' } }));
    }

    this.speechStartTime = Date.now();
    this.beginCapture();
    this.updateState('user_speaking');
    this.handlers.onSpeechStart?.();
  }

  private processVADLevel(level: number) {
    if (this.isPlayingQueue || this.currentState === 'speaking' || Date.now() < this.echoCooldownUntil || Date.now() < this.startupGraceUntil) {
      return;
    }

    if (this.vadMode === 'manual') {
      return;
    }

    // Dynamic threshold: speech must rise significantly above current ambient noise floor
    const minRmsThreshold = Math.max(0.012, this.ambientNoiseFloorRms * 2.2);
    const minLevelThreshold = Math.max(16, this.ambientNoiseFloorLevel + 10);
    const isAboveThreshold = this.latestRms >= minRmsThreshold && level >= minLevelThreshold;

    if (isAboveThreshold) {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      // Hysteresis leaky integrator
      this.speechOnsetFrames = Math.min(10, this.speechOnsetFrames + 2);

      if (this.currentState !== 'user_speaking') {
        if (this.speechOnsetFrames < this.speechOnsetNeeded) return;
        this.speechStartTime = Date.now();
        this.beginCapture();
        this.updateState('user_speaking');
        this.handlers.onSpeechStart?.();
        console.log(`[VoiceClient] Speech onset detected! (rms=${this.latestRms.toFixed(4)}, noiseFloor=${this.ambientNoiseFloorRms.toFixed(4)}, level=${level})`);
      }
    } else {
      this.speechOnsetFrames = Math.max(0, this.speechOnsetFrames - 1);

      if (this.currentState === 'user_speaking') {
        if (!this.silenceTimer) {
          this.silenceTimer = setTimeout(() => {
            void this.handleSilenceTimeout();
          }, this.silenceDurationMs);
        }
      }
    }
  }

  private async handleSilenceTimeout() {
    this.silenceTimer = null;
    if (this.isPaused) {
      this.endCapture();
      this.resetTurnToListening();
      return;
    }

    const speechDuration = Date.now() - this.speechStartTime;
    if (speechDuration < this.minSpeechDurationMs) {
      console.log(`[VoiceClient] Ignored short noise burst (${speechDuration}ms < ${this.minSpeechDurationMs}ms)`);
      this.endCapture();
      this.resetTurnToListening();
      return;
    }

    this.updateState('silence_detected');
    this.handlers.onSpeechEnd?.();

    const chunks = this.endCapture();
    const rms = this.calculateRms(chunks);
    const sampleRate = this.audioContext?.sampleRate || 48000;
    const wavBlob = this.encodeWav24kMono(chunks, sampleRate);
    console.log(`[VoiceClient] Speech finished: duration=${speechDuration}ms, chunks=${chunks.length}, size=${wavBlob.size} bytes, rms=${rms.toFixed(5)}`);

    const minRms = Math.max(0.002, this.ambientNoiseFloorRms * 1.1);
    if (wavBlob.size >= 8000 && rms >= minRms) {
      console.log(`[VoiceClient] Valid user speech captured (${wavBlob.size} bytes, rms=${rms.toFixed(5)}). Sending turn...`);
      this.isProcessingTurn = true;
      await this.sendAudioTurn(wavBlob);
    } else {
      console.log(`[VoiceClient] Turn skipped as ambient noise/silence (size: ${wavBlob.size}, rms: ${rms.toFixed(5)})`);
      this.resetTurnToListening();
    }
  }

  private calculateRms(chunks: Float32Array[]): number {
    let sumSq = 0;
    let n = 0;
    for (const c of chunks) {
      for (let i = 0; i < c.length; i += 4) {
        const s = c[i];
        sumSq += s * s;
        n++;
      }
    }
    if (n === 0) return 0;
    return Math.sqrt(sumSq / n);
  }

  private hasSpeechEnergy(chunks: Float32Array[]): boolean {
    return this.calculateRms(chunks) > 0.0008;
  }

  private encodeWav24kMono(chunks: Float32Array[], inputSampleRate: number): Blob {
    let totalLength = 0;
    for (const c of chunks) totalLength += c.length;
    if (totalLength === 0) return new Blob([], { type: 'audio/wav' });

    const flat = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      flat.set(c, offset);
      offset += c.length;
    }

    const targetRate = 24000;
    const samples = inputSampleRate === targetRate ? flat : this.resampleLinear(flat, inputSampleRate, targetRate);
    const dataLength = samples.length * 2;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    const writeString = (v: DataView, o: number, text: string) => {
      for (let i = 0; i < text.length; i++) v.setUint8(o + i, text.charCodeAt(i));
    };

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, targetRate, true);
    view.setUint32(28, targetRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, dataLength, true);

    let pcmOffset = 44;
    for (let i = 0; i < samples.length; i++, pcmOffset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(pcmOffset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  private resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
    const ratio = fromRate / toRate;
    const newLength = Math.max(1, Math.round(input.length / ratio));
    const output = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio;
      const i0 = Math.floor(srcIndex);
      const i1 = Math.min(i0 + 1, input.length - 1);
      const t = srcIndex - i0;
      output[i] = input[i0] * (1 - t) + input[i1] * t;
    }
    return output;
  }

  private async sendAudioTurn(blob: Blob) {
    if (this.isPaused) {
      this.isProcessingTurn = false;
      this.updateState('listening');
      return;
    }
    try {
      this.pendingEpoch = this.listeningEpoch;
      this.endOfResponseReceived = false;
      this.updateState('transcribing');
      const base64Audio = await this.blobToBase64(blob);

      if (this.pendingEpoch !== this.listeningEpoch) {
        this.isProcessingTurn = false;
        return;
      }

      if (this.isPaused) {
        this.isProcessingTurn = false;
        this.updateState('listening');
        return;
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.startTurnSafetyTimeout();
        this.ws.send(
          JSON.stringify({
            event: 'message',
            data: { type: 'audio_chunk', data: base64Audio },
          }),
        );
        this.ws.send(
          JSON.stringify({
            event: 'message',
            data: { type: 'end_of_turn', speech_end: Date.now() },
          }),
        );
      } else {
        this.isProcessingTurn = false;
        this.updateState('listening');
      }
    } catch {
      this.isProcessingTurn = false;
      this.updateState('listening');
      this.handlers.onError?.('Failed to send recorded voice turn');
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve((result.split(',')[1] || result) as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private enqueueAudio(base64Audio: string) {
    this.audioQueue.push(base64Audio);
    void this.pumpAudioQueue();
  }

  private async pumpAudioQueue() {
    if (this.isPlayingQueue) return;
    this.isPlayingQueue = true;

    while (this.audioQueue.length > 0) {
      if (this.isStaleResponse()) {
        this.audioQueue = [];
        break;
      }
      const next = this.audioQueue.shift();
      if (!next) break;
      await this.playAudioResponseAsync(next);
    }

    this.isPlayingQueue = false;
    this.echoCooldownUntil = Date.now() + 350;
    if (this.endOfResponseReceived && !this.isStaleResponse()) {
      this.resetTurnToListening();
    }
  }

  private async playAudioResponseAsync(base64Audio: string): Promise<void> {
    if (this.audioContext) {
      try {
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
        }
        const binaryString = atob(base64Audio);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const isContainer =
          (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || // ID3
          (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) || // RIFF
          (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0); // MPEG

        let audioBuffer: AudioBuffer;
        if (isContainer) {
          audioBuffer = await this.audioContext.decodeAudioData(bytes.buffer.slice(0));
        } else {
          // Direct PCM16 decoding (OpenAI Realtime API 24kHz Mono PCM)
          const sampleCount = Math.floor(bytes.length / 2);
          const int16 = new Int16Array(bytes.buffer, bytes.byteOffset, sampleCount);
          const float32 = new Float32Array(sampleCount);
          for (let i = 0; i < sampleCount; i++) {
            float32[i] = int16[i] / 32768.0;
          }
          audioBuffer = this.audioContext.createBuffer(1, sampleCount, 24000);
          audioBuffer.getChannelData(0).set(float32);
        }
        this.stopCurrentAudio(false);
        this.updateState('speaking');

        return await new Promise<void>((resolve) => {
          if (!this.audioContext) return resolve();
          const source = this.audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(this.audioContext.destination);
          this.currentSourceNode = source;
          source.onended = () => {
            if (this.currentSourceNode === source) {
              this.currentSourceNode = null;
            }
            resolve();
          };
          source.start(0);
        });
      } catch {
        // Fallback to HTML Audio Element if Web Audio decode fails
      }
    }

    return new Promise((resolve) => {
      try {
        this.stopCurrentAudio(false);
        this.updateState('speaking');
        const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
        this.currentAudioElement = audio;
        const finish = () => {
          if (this.currentAudioElement === audio) this.currentAudioElement = null;
          resolve();
        };
        audio.onended = finish;
        audio.onerror = finish;
        audio.play().catch(() => finish());
      } catch {
        resolve();
      }
    });
  }

  private stopCurrentAudio(clearQueue = true) {
    this.echoCooldownUntil = Date.now() + 350;
    if (clearQueue) {
      this.audioQueue = [];
      this.endOfResponseReceived = false;
    }
    if (this.currentSourceNode) {
      try {
        this.currentSourceNode.onended = null;
        this.currentSourceNode.stop();
        this.currentSourceNode.disconnect();
      } catch {
        // ignore
      }
      this.currentSourceNode = null;
    }
    if (this.currentAudioElement) {
      this.currentAudioElement.onended = null;
      this.currentAudioElement.onerror = null;
      this.currentAudioElement.pause();
      this.currentAudioElement.src = '';
      this.currentAudioElement = null;
    }
  }

  interrupt() {
    this.listeningEpoch += 1;
    this.stopCurrentAudio(true);
    this.isPlayingQueue = false;
    this.endCapture();
    this.isProcessingTurn = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event: 'message', data: { type: 'interrupt' } }));
    }
    this.updateState('listening');
  }

  // Pause = stop capture & never send audio. Typing still works.
  pause(): void {
    this.isPaused = true;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.endCapture();
    this.preRoll = [];
    this.preRollSamples = 0;
    if (this.currentState === 'user_speaking' || this.currentState === 'silence_detected') {
      this.updateState('listening');
    }
  }

  resume(): void {
    this.isPaused = false;
  }

  togglePause(): boolean {
    if (this.isPaused) this.resume();
    else this.pause();
    return this.isPaused;
  }

  // Deprecated: Prefer togglePause — same behavior
  toggleMute(): boolean {
    return this.togglePause();
  }

  sendTextMessage(text: string) {
    if (!text.trim()) return;
    this.stopCurrentAudio(true);
    this.isPlayingQueue = false;
    this.endCapture();
    this.isProcessingTurn = true;
    this.pendingEpoch = this.listeningEpoch;
    this.endOfResponseReceived = false;
    this.updateState('thinking');

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.startTurnSafetyTimeout();
      this.ws.send(
        JSON.stringify({
          event: 'message',
          data: { type: 'text_message', text },
        }),
      );
    }
  }

  private updateState(newState: VoiceState) {
    this.currentState = newState;
    this.handlers.onStatusChange?.(newState);
  }

  disconnect() {
    this.stopCurrentAudio(true);
    this.isPlayingQueue = false;
    this.isCapturing = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
    if (this.scriptProcessor) {
      this.scriptProcessor.onaudioprocess = null;
      try {
        this.scriptProcessor.disconnect();
      } catch {
        // ignore
      }
      this.scriptProcessor = null;
    }
    if (this.keepAliveGain) {
      try {
        this.keepAliveGain.disconnect();
      } catch {
        // ignore
      }
      this.keepAliveGain = null;
    }
    if (this.mediaSource) {
      try {
        this.mediaSource.disconnect();
      } catch {
        // ignore
      }
      this.mediaSource = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyser = null;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.updateState('disconnected');
  }
}
