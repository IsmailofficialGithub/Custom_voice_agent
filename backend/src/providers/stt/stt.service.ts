import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';

@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private readonly client: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
  }

  async transcribeBuffer(audioBuffer: Buffer, defaultFilename = 'speech.webm', signal?: AbortSignal): Promise<string> {
    try {
      let filename = 'speech.webm';
      let mimeType = 'audio/webm';

      if (audioBuffer.length >= 4) {
        const headerHex = audioBuffer.subarray(0, 16).toString('hex').toUpperCase();
        const headerAscii = audioBuffer.subarray(0, 16).toString('ascii');

        if (headerHex.startsWith('52494646')) {
          filename = 'speech.wav';
          mimeType = 'audio/wav';
        } else if (headerHex.startsWith('1A45DFA3')) {
          filename = 'speech.webm';
          mimeType = 'audio/webm';
        } else if (headerHex.startsWith('4F676753')) {
          filename = 'speech.ogg';
          mimeType = 'audio/ogg';
        } else if (headerHex.startsWith('494433') || headerHex.startsWith('FFFB') || headerHex.startsWith('FFF3')) {
          filename = 'speech.mp3';
          mimeType = 'audio/mp3';
        } else if (headerAscii.includes('ftyp')) {
          filename = 'speech.m4a';
          mimeType = 'audio/m4a';
        } else {
          filename = defaultFilename;
          mimeType = defaultFilename.endsWith('.wav') ? 'audio/wav' : 'audio/webm';
        }

        this.logger.log(`Audio buffer header hex: ${headerHex.substring(0, 16)} -> Selected format: ${filename}`);
      }

      this.logger.log(`Transcribing audio buffer (${audioBuffer.length} bytes, format: ${filename}, mimeType: ${mimeType})...`);

      const file = await toFile(audioBuffer, filename, { type: mimeType });
      const configuredLang = (this.config.get<string>('STT_LANGUAGE') || '').trim();
      const configuredModel = (this.config.get<string>('STT_MODEL') || 'whisper-1').trim();

      const sttOptions: any = {
        file,
        model: configuredModel,
        temperature: 0,
        prompt: 'Main tumhari aawaz sunna chahta hoon. Transcribe spoken Roman Urdu, Urdu, Hindi, Hinglish, or English verbatim.',
      };
      if (configuredLang && configuredLang !== 'auto') {
        sttOptions.language = configuredLang;
      }

      const response = await this.client.audio.transcriptions.create(sttOptions, { signal });

      const text = (response.text || '').trim();
      if (this.isLikelyHallucination(text)) {
        this.logger.warn(`STT hallucination discarded: "${text}"`);
        return '';
      }

      this.logger.log(`STT transcript: "${text}"`);
      return text;
    } catch (err: any) {
      this.logger.error(`STT transcription failed: ${err.message || err}`);
      throw err;
    }
  }

  private isLikelyHallucination(text: string): boolean {
    if (!text) return false;
    const lower = text.toLowerCase();
    const patterns = [
      /дякую/,
      /thanks for watching/,
      /thank you for watching/,
      /subscribe/,
      /字幕/,
      /amara\.org/,
      /please like and subscribe/,
    ];
    return patterns.some((p) => p.test(lower));
  }
}
