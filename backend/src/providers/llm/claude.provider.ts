import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { LlmMessage, LlmProvider, LlmResponse, LlmToolCall, ToolDefinition } from './llm.interface';

@Injectable()
export class ClaudeProvider implements LlmProvider {
  private readonly client: Anthropic;
  private readonly logger = new Logger(ClaudeProvider.name);

  constructor(private readonly config: ConfigService) {
    this.client = new Anthropic({ apiKey: config.get<string>('ANTHROPIC_API_KEY') });
  }

  async chat(messages: LlmMessage[], tools?: ToolDefinition[], model?: string): Promise<LlmResponse> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const response = await this.client.messages.create({
      model: model ?? 'claude-sonnet-4-5',
      max_tokens: 2048,
      system: systemMessage?.content,
      messages: chatMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      tools: tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool['input_schema'],
      })),
    });

    const toolCalls: LlmToolCall[] = response.content
      .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
      .map((block) => ({
        id: block.id,
        name: block.name,
        input: block.input as Record<string, unknown>,
      }));

    const textContent = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('');

    return {
      content: textContent,
      toolCalls,
      stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
    };
  }

  async chatStream(
    messages: LlmMessage[],
    tools?: ToolDefinition[],
    model?: string,
    onToken?: (token: string) => void,
    signal?: AbortSignal,
  ): Promise<LlmResponse> {
    const systemMessage = messages.find((m) => m.role === 'system');
    const chatMessages = messages.filter((m) => m.role !== 'system');

    const formattedTools = tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Tool['input_schema'],
    }));

    if (typeof this.client.messages.stream === 'function') {
      const stream = this.client.messages.stream(
        {
          model: model ?? 'claude-sonnet-4-5',
          max_tokens: 2048,
          system: systemMessage?.content,
          messages: chatMessages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
          tools: formattedTools,
        },
        { signal },
      );

      if (onToken) {
        stream.on('text', (text: string) => {
          if (!signal?.aborted) onToken(text);
        });
      }

      const response = await stream.finalMessage();
      const toolCalls: LlmToolCall[] = response.content
        .filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
        .map((block) => ({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        }));

      const textContent = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('');

      return {
        content: textContent,
        toolCalls,
        stopReason: response.stop_reason === 'tool_use' ? 'tool_use' : 'end_turn',
      };
    }

    return this.chat(messages, tools, model);
  }
}
