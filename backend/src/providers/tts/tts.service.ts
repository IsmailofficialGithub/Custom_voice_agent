import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private readonly client: OpenAI;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
  }

  async generateSpeechBuffer(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'alloy',
  ): Promise<Buffer> {
    try {
      const mp3Response = await this.client.audio.speech.create({
        model: 'tts-1',
        voice,
        input: text,
        response_format: 'mp3',
        speed: 1.05,
      });
      const buffer = Buffer.from(await mp3Response.arrayBuffer());
      return buffer;
    } catch (err) {
      this.logger.error(`TTS generation failed: ${err}`);
      throw err;
    }
  }

  async generateSpeechBase64(
    text: string,
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'alloy',
  ): Promise<string> {
    const buffer = await this.generateSpeechBuffer(text, voice);
    return buffer.toString('base64');
  }
}
