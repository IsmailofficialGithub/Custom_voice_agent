import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClaudeProvider } from './claude.provider';
import { OpenAIProvider } from './openai.provider';

export const LLM_PROVIDER = 'LLM_PROVIDER';

@Module({
  imports: [ConfigModule],
  providers: [
    ClaudeProvider,
    OpenAIProvider,
    {
      provide: LLM_PROVIDER,
      useFactory: (config: ConfigService, claude: ClaudeProvider, openai: OpenAIProvider) => {
        const provider = config.get<string>('LLM_PROVIDER') ?? 'claude';
        return provider === 'openai' ? openai : claude;
      },
      inject: [ConfigService, ClaudeProvider, OpenAIProvider],
    },
  ],
  exports: [LLM_PROVIDER, ClaudeProvider, OpenAIProvider],
})
export class LlmModule {}
