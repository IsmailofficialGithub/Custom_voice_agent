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
      model: model ?? 'gpt-4o-mini',
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

  async chatStream(
    messages: LlmMessage[],
    tools?: ToolDefinition[],
    model?: string,
    onToken?: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<LlmResponse> {
    const formattedTools = tools && tools.length > 0 ? tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    })) : undefined;

    const stream = await this.client.chat.completions.create(
      {
        model: model ?? 'gpt-4o-mini',
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        tools: formattedTools,
        stream: true,
      },
      { signal },
    );

    let content = '';
    const toolCallDeltas: Record<number, { id: string; name: string; arguments: string }> = {};
    let finishReason: 'end_turn' | 'tool_use' | 'max_tokens' = 'end_turn';

    for await (const chunk of stream) {
      if (signal?.aborted) {
        break;
      }
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (delta?.content) {
        content += delta.content;
        onToken?.(delta.content);
      }

      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCallDeltas[idx]) {
            toolCallDeltas[idx] = {
              id: tc.id || '',
              name: tc.function?.name || '',
              arguments: '',
            };
          }
          if (tc.id) toolCallDeltas[idx].id = tc.id;
          if (tc.function?.name) toolCallDeltas[idx].name = tc.function.name;
          if (tc.function?.arguments) toolCallDeltas[idx].arguments += tc.function.arguments;
        }
      }

      if (choice.finish_reason === 'tool_calls') {
        finishReason = 'tool_use';
      } else if (choice.finish_reason === 'length') {
        finishReason = 'max_tokens';
      }
    }

    const toolCalls: LlmToolCall[] = Object.values(toolCallDeltas).map((tc) => {
      let parsed = {};
      try {
        parsed = tc.arguments ? JSON.parse(tc.arguments) : {};
      } catch {
        parsed = {};
      }
      return {
        id: tc.id,
        name: tc.name,
        input: parsed as Record<string, unknown>,
      };
    });

    if (toolCalls.length > 0) {
      finishReason = 'tool_use';
    }

    return {
      content,
      toolCalls,
      stopReason: finishReason,
    };
  }
}
