import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto, UpdateConversationDto } from './conversations.dto';
import { MemoryService } from '../memory/memory.service';
import { LlmProvider } from '../providers/llm/llm.interface';
import { LLM_PROVIDER } from '../providers/llm/llm.module';

export interface CallSummaryData {
  summary: string;
  leadName: string | null;
  leadEmail: string | null;
  leadPhone: string | null;
  leadInterest: 'High' | 'Medium' | 'Low' | 'Not Interested';
  productPitched: string | null;
  nextSteps: string | null;
}

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: MemoryService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async create(agentId: string, dto: CreateConversationDto) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);

    const title =
      dto.title?.trim() ||
      `Chat · ${new Date().toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    return this.prisma.conversation.create({
      data: {
        agentId,
        title: title.slice(0, 80),
        contextPrompt: dto.contextPrompt?.trim() || null,
        ttsVoice: dto.ttsVoice || null,
        ttsGender: dto.ttsGender || null,
      },
    });
  }

  async findAllByAgent(agentId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { agentId },
      orderBy: { startedAt: 'desc' },
      include: {
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          select: { content: true, role: true, createdAt: true },
        },
      },
    });

    return conversations.map((c) => {
      const summaryMsg = c.messages.find((m) => m.role === 'call_summary');
      let callSummary: CallSummaryData | null = null;
      if (summaryMsg) {
        try {
          callSummary = JSON.parse(summaryMsg.content);
        } catch {
          callSummary = null;
        }
      }

      const recentChatMsg = c.messages.find((m) => m.role === 'user' || m.role === 'assistant');

      return {
        id: c.id,
        agentId: c.agentId,
        title: c.title,
        contextPrompt: c.contextPrompt,
        ttsVoice: c.ttsVoice,
        ttsGender: c.ttsGender,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        messageCount: c._count.messages,
        callSummary,
        lastMessage: recentChatMsg
          ? {
              role: recentChatMsg.role,
              content: recentChatMsg.content.slice(0, 120),
              createdAt: recentChatMsg.createdAt,
            }
          : null,
      };
    });
  }

  async findOne(id: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException(`Conversation ${id} not found`);
    return conv;
  }

  async getConversationWithAgent(id: string) {
    return this.prisma.conversation.findUnique({
      where: { id },
      include: { agent: true },
    });
  }

  /** Chat override → agent default → alloy */
  async resolveTtsVoice(conversationId: string): Promise<'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'> {
    const conv = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { agent: { select: { ttsVoice: true } } },
    });
    const raw = (conv?.ttsVoice || conv?.agent?.ttsVoice || 'alloy').toLowerCase();
    const allowed = new Set(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']);
    return (allowed.has(raw) ? raw : 'alloy') as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
  }

  async getMessages(conversationId: string) {
    await this.findOne(conversationId);
    return this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async update(conversationId: string, dto: UpdateConversationDto) {
    await this.findOne(conversationId);
    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim().slice(0, 80) } : {}),
        ...(dto.contextPrompt !== undefined
          ? { contextPrompt: dto.contextPrompt.trim() || null }
          : {}),
        ...(dto.ttsVoice !== undefined ? { ttsVoice: dto.ttsVoice || null } : {}),
        ...(dto.ttsGender !== undefined ? { ttsGender: dto.ttsGender || null } : {}),
      },
    });
  }

  async markConnected(conversationId: string) {
    try {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { endedAt: null },
      });
    } catch {
      // ignore
    }
  }

  async delete(conversationId: string) {
    await this.findOne(conversationId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { message: 'Conversation deleted' };
  }

  extractLeadHeuristic(messages: Array<{ role: string; content: string }>): CallSummaryData {
    const dialog = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    if (dialog.length === 0) {
      return {
        summary: 'Call connected, but no conversation recorded.',
        leadName: null,
        leadEmail: null,
        leadPhone: null,
        leadInterest: 'Not Interested',
        productPitched: null,
        nextSteps: 'No action needed',
      };
    }
    const transcript = dialog.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const emailMatch = transcript.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
    const phoneMatch = transcript.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    const isHigh = /interested|buy|purchase|sign up|price|pricing|demo|cost|quote|deal/i.test(transcript);
    const isNot = /not interested|stop|don't call|unsubscribe|no thanks/i.test(transcript);

    return {
      summary: dialog.slice(-2).map((m) => m.content).join(' · ').slice(0, 200) || 'Call concluded.',
      leadName: null,
      leadEmail: emailMatch ? emailMatch[0] : null,
      leadPhone: phoneMatch ? phoneMatch[0] : null,
      leadInterest: isNot ? 'Not Interested' : isHigh ? 'High' : 'Medium',
      productPitched: 'Voice Agent Services',
      nextSteps: emailMatch || phoneMatch ? 'Contact captured lead' : 'Follow up if user returns',
    };
  }

  async extractLeadWithLlm(messages: Array<{ role: string; content: string }>): Promise<CallSummaryData> {
    const dialog = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
    if (dialog.length === 0) {
      return this.extractLeadHeuristic(messages);
    }

    const transcript = dialog.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n');
    const emailMatch = transcript.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
    const phoneMatch = transcript.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);

    try {
      const response = await this.llm.chat([
        {
          role: 'system',
          content:
            'You are a CRM sales intelligence analyst. Analyze the following sales voice call transcript and extract lead details and a summary. You MUST output ONLY valid JSON without any markdown formatting or explanation.',
        },
        {
          role: 'user',
          content: `Extract structured sales call details from this transcript:
${transcript}

Output JSON format:
{
  "summary": "2-3 sentences summarizing the discussion and customer interest",
  "leadName": "Customer name if mentioned, otherwise null",
  "leadEmail": "Customer email address if mentioned, otherwise null",
  "leadPhone": "Customer phone number if mentioned, otherwise null",
  "leadInterest": "High" | "Medium" | "Low" | "Not Interested",
  "productPitched": "Product or solution discussed, otherwise null",
  "nextSteps": "Recommended follow-up action"
}`,
        },
      ]);

      const cleaned = response.content
        .trim()
        .replace(/^```json/i, '')
        .replace(/^```/i, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(cleaned);

      return {
        summary: parsed.summary || 'Call completed.',
        leadName: parsed.leadName || null,
        leadEmail: parsed.leadEmail || (emailMatch ? emailMatch[0] : null),
        leadPhone: parsed.leadPhone || (phoneMatch ? phoneMatch[0] : null),
        leadInterest: ['High', 'Medium', 'Low', 'Not Interested'].includes(parsed.leadInterest)
          ? parsed.leadInterest
          : 'Medium',
        productPitched: parsed.productPitched || null,
        nextSteps: parsed.nextSteps || 'Follow up with customer',
      };
    } catch {
      return this.extractLeadHeuristic(messages);
    }
  }

  async end(conversationId: string) {
    const conv = await this.findOne(conversationId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    const existingSummary = messages.find((m) => m.role === 'call_summary');
    let callSummary: CallSummaryData;

    if (existingSummary) {
      try {
        callSummary = JSON.parse(existingSummary.content);
      } catch {
        callSummary = this.extractLeadHeuristic(messages);
      }
    } else {
      // ONLY called the FIRST TIME when the call actually ends
      callSummary = await this.extractLeadWithLlm(messages);
      await this.prisma.message.create({
        data: {
          conversationId,
          role: 'call_summary',
          content: JSON.stringify(callSummary),
        },
      });
    }

    if (messages.length > 0) {
      const contents = messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => `${m.role}: ${m.content}`);
      if (contents.length > 0) {
        this.memoryService.summarizeAndStore(conv.agentId, contents).catch(() => {});
      }
    }

    const updated = await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { endedAt: conv.endedAt || new Date() },
    });

    return {
      ...updated,
      callSummary,
    };
  }

  async getSummary(conversationId: string): Promise<CallSummaryData> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    const existingSummary = messages.find((m) => m.role === 'call_summary');
    if (existingSummary) {
      try {
        return JSON.parse(existingSummary.content);
      } catch {
        return this.extractLeadHeuristic(messages);
      }
    }

    // Never call LLM on summary fetches — use stored or heuristic fallback
    return this.extractLeadHeuristic(messages);
  }

  async getCallLogs(agentId?: string, onlyAgentIds?: string[]) {
    const conversations = await this.prisma.conversation.findMany({
      where: agentId ? { agentId } : onlyAgentIds ? { agentId: { in: onlyAgentIds } } : {},
      orderBy: { startedAt: 'desc' },
      include: {
        agent: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { role: true, content: true, createdAt: true },
        },
      },
    });

    return conversations.map((c) => {
      const summaryMsg = c.messages.find((m) => m.role === 'call_summary');
      let callSummary: CallSummaryData | null = null;
      if (summaryMsg) {
        try {
          callSummary = JSON.parse(summaryMsg.content);
        } catch {
          callSummary = null;
        }
      } else if (c.messages.length > 0) {
        const transcript = c.messages
          .filter((m) => m.role === 'user' || m.role === 'assistant')
          .map((m) => m.content)
          .join('\n');
        const emailMatch = transcript.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/i);
        const phoneMatch = transcript.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
        const isHigh = /interested|buy|purchase|sign up|price|demo|deal/i.test(transcript);
        callSummary = {
          summary: c.messages[c.messages.length - 1]?.content.slice(0, 160) || 'Call logged',
          leadName: null,
          leadEmail: emailMatch ? emailMatch[0] : null,
          leadPhone: phoneMatch ? phoneMatch[0] : null,
          leadInterest: isHigh ? 'High' : 'Medium',
          productPitched: 'Voice Agent Services',
          nextSteps: emailMatch || phoneMatch ? 'Contact captured lead' : 'Follow up',
        };
      }

      const dialogMessages = c.messages.filter((m) => m.role === 'user' || m.role === 'assistant');

      let durationSeconds: number | null = null;
      if (dialogMessages.length >= 2) {
        const firstMsgTime = dialogMessages[0].createdAt.getTime();
        const lastMsgTime = dialogMessages[dialogMessages.length - 1].createdAt.getTime();

        let callEnd = lastMsgTime + 10_000;
        if (c.endedAt) {
          const endedTime = c.endedAt.getTime();
          if (endedTime >= lastMsgTime && endedTime - lastMsgTime <= 60_000) {
            callEnd = endedTime;
          } else if (endedTime >= lastMsgTime) {
            callEnd = lastMsgTime + 15_000;
          }
        }
        durationSeconds = Math.max(5, Math.round((callEnd - firstMsgTime) / 1000));
      } else if (dialogMessages.length === 1) {
        durationSeconds = 12;
      } else if (c.endedAt) {
        const diff = Math.round((c.endedAt.getTime() - c.startedAt.getTime()) / 1000);
        durationSeconds = Math.min(30, Math.max(1, diff));
      }

      return {
        id: c.id,
        agentId: c.agentId,
        agentName: c.agent?.name || 'Agent',
        title: c.title,
        contextPrompt: c.contextPrompt,
        startedAt: c.startedAt,
        endedAt: c.endedAt,
        durationSeconds,
        messageCount: c._count.messages,
        callSummary,
      };
    });
  }

  async addMessage(conversationId: string, role: string, content: string, toolName?: string) {
    return this.prisma.message.create({
      data: { conversationId, role, content, toolName },
    });
  }

  async getAgentKnowledge(agentId: string): Promise<string> {
    try {
      const chunks = await this.prisma.documentChunk.findMany({
        where: {
          document: {
            agentId,
            status: 'ready',
          },
        },
        orderBy: [
          { documentId: 'asc' },
          { chunkIndex: 'asc' },
        ],
        select: {
          content: true,
          document: {
            select: { filename: true },
          },
        },
        take: 40,
      });

      if (!chunks || chunks.length === 0) return '';

      let knowledge = '\n\n### Uploaded Knowledge Base Documents:\nYou have access to the following reference documents for this agent. When the user asks about them or related topics, answer accurately using this information:\n';
      for (const c of chunks) {
        knowledge += `\n[Document: "${c.document.filename}"]:\n${c.content}\n`;
      }
      return knowledge;
    } catch {
      return '';
    }
  }
}
