import { Injectable, Logger, Inject, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmProvider, LlmMessage, ToolDefinition } from '../providers/llm/llm.interface';
import { LLM_PROVIDER } from '../providers/llm/llm.module';
import { TimeTool } from '../tools/time.tool';
import { WebSearchTool } from '../tools/web-search.tool';
import { KnowledgeBaseTool } from '../tools/knowledge-base.tool';
import { MemoryService } from '../memory/memory.service';
import { ConfigService } from '@nestjs/config';

import { ClaudeProvider } from '../providers/llm/claude.provider';
import { OpenAIProvider } from '../providers/llm/openai.provider';

const BASE_RULES = `You are a helpful AI voice assistant. Follow these rules strictly:
- If the user asks about uploaded documents, resumes, PDFs, files, or anything that may be in their knowledge base, you MUST call search_knowledge_base before answering
- Do not claim you lack access to uploaded documents without calling search_knowledge_base first
- When using knowledge base results, ground your response in the retrieved content
- If retrieved documents don't answer the question, say so rather than answering from general knowledge
- Never invent quotes, page numbers, or section names not present in the retrieved chunks
- Always tell the user when a tool call fails — never fabricate results silently
- Be concise and conversational — this is a voice interaction
- ALWAYS respond in the EXACT same language and script used by the user. If the user speaks Roman Urdu or Hindi (e.g. "kya kar rahi ho"), respond in Roman Urdu/Hindi (e.g. "Main theek hoon, aap batao"). Never translate Roman Urdu or Hindi input into English responses
- Default to 1–2 short spoken sentences unless the user clearly asks for detail
- Prefer a direct answer first; skip filler and long preambles
- When sharing emails or links from documents, write them in full plain text (no markdown) so they stay readable`;

@Injectable()
export class OrchestratorService {
  private readonly logger = new Logger(OrchestratorService.name);
  private readonly shortTermWindow: number;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly defaultLlm: LlmProvider,
    private readonly claudeProvider: ClaudeProvider,
    private readonly openaiProvider: OpenAIProvider,
    private readonly timeTool: TimeTool,
    private readonly webSearchTool: WebSearchTool,
    private readonly knowledgeBaseTool: KnowledgeBaseTool,
    private readonly memoryService: MemoryService,
    private readonly config: ConfigService,
  ) {
    this.shortTermWindow = parseInt(config.get('SHORT_TERM_WINDOW') ?? '20', 10);
  }

  async handleTextTurn(conversationId: string, userMessage: string): Promise<{ role: string; content: string }> {
    // Load conversation + agent
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { agent: true },
    });
    if (!conversation) throw new NotFoundException(`Conversation ${conversationId} not found`);

    const agent = conversation.agent;

    // Persist user message
    await this.prisma.message.create({
      data: { conversationId, role: 'user', content: userMessage },
    });

    // Auto-title chat from first user message
    await this.maybeRenameConversation(conversationId, conversation.title, userMessage);

    // Load short-term memory (last N messages)
    const recentMessages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      take: this.shortTermWindow,
    });
    recentMessages.reverse();

    // Load long-term memory only if agent has stored memories
    let longTermMemories: string[] = [];
    const memoryCount = await this.prisma.memory.count({ where: { agentId: agent.id } });
    if (memoryCount > 0) {
      longTermMemories = await this.memoryService.retrieveRelevant(agent.id, userMessage);
    }

    // Build tool definitions from enabled tools
    const toolDefs = this.buildToolDefs(agent.enabledTools);

    // Assemble system prompt (agent persona + per-chat user context)
    const systemPrompt = this.buildSystemPrompt(
      agent.systemPrompt,
      longTermMemories,
      conversation.contextPrompt,
    );

    // Build message history — toLlmHistoryMessages handles merging consecutive
    // user turns and converting tool results cleanly for the provider.
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.toLlmHistoryMessages(recentMessages),
    ];

    // Determine LLM provider dynamically
    const llm: LlmProvider =
      agent.llmProvider === 'openai'
        ? this.openaiProvider
        : agent.llmProvider === 'claude'
        ? this.claudeProvider
        : this.defaultLlm;

    // Tool-calling loop
    let finalContent = '';
    let iteration = 0;
    const MAX_ITERATIONS = 5;

    try {
      while (iteration < MAX_ITERATIONS) {
        iteration++;
        const response = await llm.chat(messages, toolDefs, agent.llmModel);

        if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
          finalContent = response.content;
          break;
        }

        // Execute tool calls
        for (const toolCall of response.toolCalls) {
          const toolResult = await this.executeTool(toolCall.name, toolCall.input, agent.id, agent.enabledTools);
          const resultStr = JSON.stringify(toolResult);

          // Add assistant + tool result to message chain
          messages.push({ role: 'assistant', content: response.content || `Using tool: ${toolCall.name}` });
          messages.push({ role: 'user', content: `Tool result for ${toolCall.name}: ${resultStr}` });

          // Persist tool call
          await this.prisma.message.create({
            data: { conversationId, role: 'tool', content: resultStr, toolName: toolCall.name },
          });
        }
      }

      // Persist assistant response
      await this.prisma.message.create({
        data: { conversationId, role: 'assistant', content: finalContent },
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`LLM error in orchestrator: ${errMsg}`);
      throw new ServiceUnavailableException(`LLM provider error: ${errMsg.slice(0, 100)}`);
    }

    // Trigger memory summarization if threshold hit
    const totalMessages = await this.prisma.message.count({ where: { conversationId } });
    const triggerTurns = parseInt(this.config.get('MEMORY_TRIGGER_TURNS') ?? '10', 10);
    if (totalMessages % (triggerTurns * 2) === 0) {
      this.memoryService.summarizeAndStore(agent.id, recentMessages.map((m) => m.content)).catch((err) => {
        this.logger.error(`Memory summarization failed: ${err}`);
      });
    }

    return { role: 'assistant', content: finalContent };
  }

  async handleTextTurnStream(
    conversationId: string,
    userMessage: string,
    callbacks: {
      onFirstToken?: () => void;
      onToken?: (token: string) => void;
      onSentence?: (sentence: string) => Promise<void> | void;
    },
    signal?: AbortSignal,
  ): Promise<{ role: string; content: string; spokenContent?: string }> {
    // Load conversation + agent
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { agent: true },
    });
    if (!conversation) throw new NotFoundException(`Conversation ${conversationId} not found`);

    const agent = conversation.agent;

    // Persist user message in background (non-blocking for voice latency)
    void this.prisma.message.create({
      data: { conversationId, role: 'user', content: userMessage },
    }).catch((e) => this.logger.warn(`Failed to persist user message: ${e}`));

    // Auto-title chat in background
    void this.maybeRenameConversation(conversationId, conversation.title, userMessage).catch(() => {});

    // Run short-term history and memory count in parallel
    const [recentMessages, memoryCount] = await Promise.all([
      this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: this.shortTermWindow,
      }),
      this.prisma.memory.count({ where: { agentId: agent.id } }),
    ]);
    recentMessages.reverse();

    // Load long-term memory only if agent has stored memories
    let longTermMemories: string[] = [];
    if (memoryCount > 0) {
      longTermMemories = await this.memoryService.retrieveRelevant(agent.id, userMessage);
    }

    // Build tool definitions from enabled tools
    const toolDefs = this.buildToolDefs(agent.enabledTools);

    // Assemble system prompt
    const systemPrompt = this.buildSystemPrompt(
      agent.systemPrompt,
      longTermMemories,
      conversation.contextPrompt,
    );

    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      ...this.toLlmHistoryMessages(recentMessages),
    ];

    const llm: LlmProvider =
      agent.llmProvider === 'openai'
        ? this.openaiProvider
        : agent.llmProvider === 'claude'
        ? this.claudeProvider
        : this.defaultLlm;

    let finalContent = '';
    let iteration = 0;
    const MAX_ITERATIONS = 5;
    const spokenSentences: string[] = [];
    let sentenceBuffer = '';
    let firstTokenSeen = false;

    const dispatchSentence = async (text: string) => {
      const clean = text.trim();
      if (!clean || signal?.aborted) return;
      spokenSentences.push(clean);
      if (callbacks.onSentence) {
        await callbacks.onSentence(clean);
      }
    };

    const handleChunkToken = (token: string) => {
      if (signal?.aborted) return;
      if (!firstTokenSeen) {
        firstTokenSeen = true;
        callbacks.onFirstToken?.();
      }
      callbacks.onToken?.(token);

      sentenceBuffer += token;

      // Ultra-Fast Phrasal Streaming for Voice:
      // 1. Immediately dispatch on terminal punctuation (. ? ! \n), even for single words ("Hello!", "Hi!")
      // 2. Dispatch on clause pauses (, ; : -) when at least 2 words are ready
      // 3. Fallback: chunk after 4-5 words on a space boundary so TTS starts immediately
      const words = sentenceBuffer.trim().split(/\s+/);
      const hasTerminal = /[.?!;\n]/.test(sentenceBuffer);
      const hasClause = /[,:\-]/.test(sentenceBuffer);

      if (hasTerminal && words.length >= 1) {
        const match = sentenceBuffer.match(/^(.*?[.?!;\n])(?:\s+|$)([\s\S]*)$/);
        if (match) {
          const candidate = match[1].trim();
          const remainder = match[2];
          const isAbbrev = /(?:e\.g|i\.e|mr|mrs|ms|dr|vs)\.$/i.test(candidate);
          const isDecimal = /\d+\.$/.test(candidate);

          if (!isAbbrev && !isDecimal && candidate.length >= 2) {
            sentenceBuffer = remainder;
            dispatchSentence(candidate).catch((err) => {
              this.logger.warn(`Sentence dispatch error: ${err}`);
            });
            return;
          }
        }
      }

      if (hasClause && words.length >= 2) {
        const match = sentenceBuffer.match(/^(.*?[,:\-])(?:\s+|$)([\s\S]*)$/);
        if (match) {
          const candidate = match[1].trim();
          const remainder = match[2];
          if (candidate.length >= 2) {
            sentenceBuffer = remainder;
            dispatchSentence(candidate).catch((err) => {
              this.logger.warn(`Clause dispatch error: ${err}`);
            });
            return;
          }
        }
      }

      if (words.length >= 5 && /\s+$/.test(sentenceBuffer)) {
        const chunk = words.slice(0, 4).join(' ');
        sentenceBuffer = words.slice(4).join(' ');
        dispatchSentence(chunk).catch((err) => {
          this.logger.warn(`Length dispatch error: ${err}`);
        });
      }
    };

    try {
      while (iteration < MAX_ITERATIONS) {
        if (signal?.aborted) break;
        iteration++;

        let response: { content: string; toolCalls: any[]; stopReason: string };

        if (llm.chatStream && typeof llm.chatStream === 'function') {
          response = await llm.chatStream(
            messages,
            toolDefs,
            agent.llmModel,
            handleChunkToken,
            signal,
          );
        } else {
          response = await llm.chat(messages, toolDefs, agent.llmModel);
          if (!firstTokenSeen) {
            firstTokenSeen = true;
            callbacks.onFirstToken?.();
          }
        }

        if (signal?.aborted) break;

        if (response.stopReason === 'end_turn' || response.toolCalls.length === 0) {
          finalContent = response.content;
          break;
        }

        // Execute tool calls
        for (const toolCall of response.toolCalls) {
          if (signal?.aborted) break;
          const toolResult = await this.executeTool(toolCall.name, toolCall.input, agent.id, agent.enabledTools);
          const resultStr = JSON.stringify(toolResult);

          messages.push({ role: 'assistant', content: response.content || `Using tool: ${toolCall.name}` });
          messages.push({ role: 'user', content: `Tool result for ${toolCall.name}: ${resultStr}` });

          await this.prisma.message.create({
            data: { conversationId, role: 'tool', content: resultStr, toolName: toolCall.name },
          });
        }
      }

      // Flush any trailing sentence buffer left over
      if (sentenceBuffer.trim() && !signal?.aborted) {
        await dispatchSentence(sentenceBuffer.trim());
      }

      // If aborted mid-flight, persist only what was actually spoken out loud
      if (signal?.aborted) {
        const spoken = spokenSentences.join(' ').trim();
        if (spoken) {
          await this.prisma.message.create({
            data: { conversationId, role: 'assistant', content: `${spoken} [interrupted]` },
          });
        }
        return { role: 'assistant', content: spoken, spokenContent: spoken };
      }

      // Persist full assistant response
      await this.prisma.message.create({
        data: { conversationId, role: 'assistant', content: finalContent },
      });
    } catch (err: unknown) {
      if (signal?.aborted) {
        const spoken = spokenSentences.join(' ').trim();
        return { role: 'assistant', content: spoken, spokenContent: spoken };
      }
      const errMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`LLM streaming error in orchestrator: ${errMsg}`);
      throw new ServiceUnavailableException(`LLM provider error: ${errMsg.slice(0, 100)}`);
    }

    // Trigger memory summarization if threshold hit
    const totalMessages = await this.prisma.message.count({ where: { conversationId } });
    const triggerTurns = parseInt(this.config.get('MEMORY_TRIGGER_TURNS') ?? '10', 10);
    if (totalMessages % (triggerTurns * 2) === 0) {
      this.memoryService.summarizeAndStore(agent.id, recentMessages.map((m) => m.content)).catch((err) => {
        this.logger.error(`Memory summarization failed: ${err}`);
      });
    }

    return { role: 'assistant', content: finalContent, spokenContent: spokenSentences.join(' ').trim() };
  }

  private async maybeRenameConversation(
    conversationId: string,
    currentTitle: string | null,
    userMessage: string,
  ) {
    const isDefault =
      !currentTitle ||
      currentTitle.startsWith('Chat ·') ||
      currentTitle === 'New chat' ||
      currentTitle === 'Voice Playground Call';
    if (!isDefault) return;

    const userCount = await this.prisma.message.count({
      where: { conversationId, role: 'user' },
    });
    if (userCount !== 1) return;

    const title = userMessage.trim().slice(0, 60);
    if (!title) return;

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { title },
    });
  }

  private toLlmHistoryMessages(
    recentMessages: Array<{ role: string; content: string; toolName?: string | null }>,
  ): LlmMessage[] {
    const history: LlmMessage[] = [];
    for (const m of recentMessages) {
      if (m.role === 'user') {
        const last = history[history.length - 1];
        if (last && last.role === 'user') {
          // Merge consecutive user turns so prior context is never lost
          last.content = `${last.content}\n${m.content}`;
        } else {
          history.push({ role: 'user', content: m.content });
        }
      } else if (m.role === 'assistant') {
        if (m.content?.trim()) {
          history.push({ role: 'assistant', content: m.content });
        }
      } else if (m.role === 'tool') {
        const name = m.toolName || 'tool';
        history.push({ role: 'user', content: `Tool result for ${name}: ${m.content}` });
      }
    }
    return history;
  }

  private buildSystemPrompt(
    agentPersona: string,
    memories: string[],
    chatContextPrompt?: string | null,
  ): string {
    const parts = [BASE_RULES, `\n\nAgent Role:\n${agentPersona}`];
    if (chatContextPrompt?.trim()) {
      parts.push(
        `\n\nChat-specific context (from the user — follow this for this conversation):\n${chatContextPrompt.trim()}`,
      );
    }
    if (memories.length > 0) {
      parts.push(`\n\nRelevant memory from prior sessions:\n${memories.map((m) => `- ${m}`).join('\n')}`);
    }
    return parts.join('');
  }

  private buildToolDefs(enabledTools: string[]): ToolDefinition[] {
    const allTools: Record<string, ToolDefinition> = {
      get_time: {
        name: this.timeTool.name,
        description: this.timeTool.description,
        parameters: this.timeTool.parameters as unknown as Record<string, unknown>,
      },
      web_search: {
        name: this.webSearchTool.name,
        description: this.webSearchTool.description,
        parameters: this.webSearchTool.parameters as unknown as Record<string, unknown>,
      },
      search_knowledge_base: {
        name: this.knowledgeBaseTool.name,
        description: this.knowledgeBaseTool.description,
        parameters: this.knowledgeBaseTool.parameters as unknown as Record<string, unknown>,
      },
    };
    return enabledTools.filter((t) => allTools[t]).map((t) => allTools[t]);
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    agentId: string,
    enabledTools: string[],
  ): Promise<unknown> {
    if (!enabledTools.includes(name)) {
      return { error: `Tool ${name} is not enabled for this agent` };
    }

    switch (name) {
      case 'get_time':
        return this.timeTool.execute(input as { timezone?: string });
      case 'web_search':
        return this.webSearchTool.execute(input as { query: string });
      case 'search_knowledge_base':
        return this.knowledgeBaseTool.execute(input as { query: string }, agentId);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  }
}
