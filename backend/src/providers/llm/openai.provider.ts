import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { LlmMessage, LlmProvider, LlmResponse, LlmToolCall, ToolDefinition } from './llm.interface';

@Injectable()
export class OpenAIProvider implements LlmProvider {
  private readonly client: OpenAI;
  private readonly logger = new Logger(OpenAIProvider.name);

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({ apiKey: config.get<string>('OPENAI_API_KEY') });
  }

  async chat(messages: LlmMessage[], tools?: ToolDefinition[], model?: string): Promise<LlmResponse> {
    const response = await this.client.chat.completions.create({
      model: model ?? 'gpt-4o',
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      tools: tools?.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })),
    });

    const choice = response.choices[0];
    const toolCalls: LlmToolCall[] =
      choice.message.tool_calls
        ?.filter((tc) => 'function' in tc)
        .map((tc) => {
          const fn = (tc as { id: string; function: { name: string; arguments: string } });
          return {
            id: fn.id,
            name: fn.function.name,
            input: JSON.parse(fn.function.arguments) as Record<string, unknown>,
          };
        }) ?? [];

    return {
      content: choice.message.content ?? '',
      toolCalls,
      stopReason: choice.finish_reason === 'tool_calls' ? 'tool_use' : 'end_turn',
    };
  }
}
