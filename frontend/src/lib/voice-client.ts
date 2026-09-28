// Real-Time Voice WebSocket Client
// Continuous PCM capture (pre-roll + speech window) → 16kHz WAV for Whisper
// Fast endpointing for lower turn latency

export type VoiceState =
  | 'idle'
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

  private currentAudioElement: HTMLAudioElement | null = null;
  private currentState: VoiceState = 'idle';

  /** When true: no mic capture, no audio send. Typed messages still work. */
  private isPaused = false;
  private isProcessingTurn = false;
  private isCapturing = false;
  private speechStartTime = 0;

  private listeningEpoch = 0;
  private pendingEpoch = 0;

  private audioQueue: string[] = [];
  private isPlayingQueue = false;
  private endOfResponseReceived = false;

  /** Always-on short pre-roll so we don't clip the start of speech */
  private preRoll: Float32Array[] = [];
  private captureChunks: Float32Array[] = [];
  private preRollSamples = 0;
  private captureSamples = 0;

  // VAD — require real speech, ignore ambient room noise
  private readonly silenceThreshold = 22;
  private readonly bargeInThreshold = 28;
  private readonly silenceDurationMs = 550;
  private readonly minSpeechDurationMs = 400;
  private readonly preRollMs = 280;
  private readonly speechOnsetNeeded = 5;
  private speechOnsetFrames = 0;

  constructor(
    private readonly conversationId: string,
    private readonly apiKey: string,
    private readonly handlers: VoiceEventHandlers,
    private readonly wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3002/api/v1/voice',
  ) {}

  public get state(): VoiceState {
    return this.currentState;
  }

  public get muted(): boolean {
    return this.isPaused;
  }

  public get paused(): boolean {
    return this.isPaused;
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
    msg: { type: string; conversationId?: string; text?: string; data?: string; status?: VoiceState; message?: string },
    resolve: () => void,
  ) {
    switch (msg.type) {
      case 'connected':
        if (msg.conversationId) {
          this.handlers.onConnected?.(msg.conversationId);
          resolve();
        }
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
        if (msg.text) {
          this.updateState('thinking');
          this.handlers.onResponseTextChunk?.(msg.text);
        }
        break;
      case 'audio_response_chunk':
        if (this.isStaleResponse()) return;
        if (msg.data) {
          this.handlers.onAudioResponseChunk?.(msg.data);
          this.enqueueAudio(msg.data);
        }
        break;
      case 'end_of_response':
        if (this.isStaleResponse()) return;
        this.endOfResponseReceived = true;
        if (!this.isPlayingQueue && this.audioQueue.length === 0) {
          this.isProcessingTurn = false;
          if (this.currentState !== 'speaking' && this.currentState !== 'user_speaking') {
            this.updateState('listening');
          }
        }
        break;
      case 'status':
        if (msg.status === 'idle') {
          if (!this.isStaleResponse()) {
            this.isProcessingTurn = false;
            if (this.currentState !== 'user_speaking') this.updateState('listening');
          }
        } else if (msg.status) {
          if (this.isStaleResponse()) return;
          this.updateState(msg.status);
        }
        break;
      case 'error':
        if (!this.isStaleResponse()) {
          this.isProcessingTurn = false;
          if (this.currentState !== 'user_speaking') this.updateState('listening');
          if (msg.message) this.handlers.onError?.(msg.message);
        }
        break;
    }
  }

  async startCall(): Promise<void> {
    try {
      await this.initMicrophone();
      this.updateState('listening');
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
    this.audioContext = new AudioContextClass({ sampleRate: 48000 });
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.mediaSource = this.audioContext.createMediaStreamSource(this.mediaStream);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.3;
    this.mediaSource.connect(this.analyser);

    // Continuous PCM — gain must be tiny but non-zero or Chrome skips the node
    const bufferSize = 2048;
    this.scriptProcessor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
    this.keepAliveGain = this.audioContext.createGain();
    this.keepAliveGain.gain.value = 0.0001;

    this.scriptProcessor.onaudioprocess = (event) => {
      if (this.isPaused) return;
      const input = event.inputBuffer.getChannelData(0);
      const copy = new Float32Array(input.length);
      copy.set(input);

      if (this.isCapturing) {
        this.captureChunks.push(copy);
        this.captureSamples += copy.length;
      } else {
        this.preRoll.push(copy);
        this.preRollSamples += copy.length;
        const maxPre = Math.floor(((this.audioContext?.sampleRate || 48000) * this.preRollMs) / 1000);
        while (this.preRollSamples > maxPre && this.preRoll.length > 0) {
          const dropped = this.preRoll.shift();
          if (dropped) this.preRollSamples -= dropped.length;
        }
      }
    };

    this.mediaSource.connect(this.scriptProcessor);
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

      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
      const normalized = Math.min(100, Math.round((sum / dataArray.length / 128) * 100));
      this.handlers.onAudioLevelChange?.(normalized);

      if (this.isPaused) {
        this.animFrameId = requestAnimationFrame(update);
        return;
      }

      if (this.currentState === 'speaking' && normalized >= this.bargeInThreshold) {
        this.bargeIn();
      }

      if (!this.isProcessingTurn || this.currentState === 'user_speaking') {
        this.processVADLevel(normalized);
      }

      this.animFrameId = requestAnimationFrame(update);
    };

    update();
  }

  private bargeIn() {
    this.listeningEpoch += 1;
    this.stopCurrentAudio(true);
    this.isPlayingQueue = false;
    this.isProcessingTurn = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.speechStartTime = Date.now();
    this.beginCapture();
    this.updateState('user_speaking');
    this.handlers.onSpeechStart?.();
  }

  private processVADLevel(level: number) {
    const isAboveThreshold = level >= this.silenceThreshold;

    if (isAboveThreshold) {
      if (this.silenceTimer) {
        clearTimeout(this.silenceTimer);
        this.silenceTimer = null;
      }

      this.speechOnsetFrames += 1;

      if (this.currentState !== 'user_speaking') {
        // Need a few consecutive loud frames so keyboard clicks / AC hum don't start a turn
        if (this.speechOnsetFrames < this.speechOnsetNeeded) return;
        this.speechStartTime = Date.now();
        this.beginCapture();
        this.updateState('user_speaking');
        this.handlers.onSpeechStart?.();
      }
    } else {
      this.speechOnsetFrames = 0;

      if (this.currentState === 'user_speaking') {
        const speechDuration = Date.now() - this.speechStartTime;

        if (speechDuration < this.minSpeechDurationMs) {
          this.endCapture();
          this.updateState('listening');
          return;
        }

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
      this.isProcessingTurn = false;
      this.updateState('listening');
      return;
    }

    this.updateState('silence_detected');
    this.handlers.onSpeechEnd?.();

    const chunks = this.endCapture();
    const sampleRate = this.audioContext?.sampleRate || 48000;
    const wavBlob = this.encodeWav16kMono(chunks, sampleRate);

    // ~0.4s of 16kHz mono 16-bit ≈ 12KB+ header; require real speech energy
    if (wavBlob.size >= 6000 && this.hasSpeechEnergy(chunks)) {
      this.isProcessingTurn = true;
      await this.sendAudioTurn(wavBlob);
    } else {
      this.isProcessingTurn = false;
      this.updateState('listening');
    }
  }

  private hasSpeechEnergy(chunks: Float32Array[]): boolean {
    let sumSq = 0;
    let n = 0;
    for (const c of chunks) {
      for (let i = 0; i < c.length; i += 4) {
        const s = c[i];
        sumSq += s * s;
        n++;
      }
    }
    if (n === 0) return false;
    const rms = Math.sqrt(sumSq / n);
    return rms > 0.01;
  }

  private encodeWav16kMono(chunks: Float32Array[], inputSampleRate: number): Blob {
    let totalLength = 0;
    for (const c of chunks) totalLength += c.length;
    if (totalLength === 0) return new Blob([], { type: 'audio/wav' });

    const flat = new Float32Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
      flat.set(c, offset);
      offset += c.length;
    }

    const targetRate = 16000;
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
        this.ws.send(
          JSON.stringify({
            event: 'message',
            data: { type: 'audio_chunk', data: base64Audio },
          }),
        );
        this.ws.send(
          JSON.stringify({
            event: 'message',
            data: { type: 'end_of_turn' },
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
    if (this.endOfResponseReceived && !this.isStaleResponse()) {
      this.isProcessingTurn = false;
      if (this.currentState !== 'user_speaking') this.updateState('listening');
    }
  }

  private playAudioResponseAsync(base64Audio: string): Promise<void> {
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
    if (clearQueue) {
      this.audioQueue = [];
      this.endOfResponseReceived = false;
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
    this.updateState('listening');
  }

  /** Pause = stop capture & never send audio. Typing still works. */
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

  /** @deprecated Prefer togglePause — same behavior */
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
        /* ignore */
      }
      this.scriptProcessor = null;
    }
    if (this.keepAliveGain) {
      try {
        this.keepAliveGain.disconnect();
      } catch {
        /* ignore */
      }
      this.keepAliveGain = null;
    }
    if (this.mediaSource) {
      try {
        this.mediaSource.disconnect();
      } catch {
        /* ignore */
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
