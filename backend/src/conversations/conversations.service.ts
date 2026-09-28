import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateConversationDto, UpdateConversationDto } from './conversations.dto';
import { MemoryService } from '../memory/memory.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly memoryService: MemoryService,
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
          where: { role: { in: ['user', 'assistant'] } },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true, createdAt: true },
        },
      },
    });

    return conversations.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      title: c.title,
      contextPrompt: c.contextPrompt,
      ttsVoice: c.ttsVoice,
      ttsGender: c.ttsGender,
      startedAt: c.startedAt,
      endedAt: c.endedAt,
      messageCount: c._count.messages,
      lastMessage: c.messages[0]
        ? {
            role: c.messages[0].role,
            content: c.messages[0].content.slice(0, 120),
            createdAt: c.messages[0].createdAt,
          }
        : null,
    }));
  }

  async findOne(id: string) {
    const conv = await this.prisma.conversation.findUnique({ where: { id } });
    if (!conv) throw new NotFoundException(`Conversation ${id} not found`);
    return conv;
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

  async delete(conversationId: string) {
    await this.findOne(conversationId);
    await this.prisma.conversation.delete({ where: { id: conversationId } });
    return { message: 'Conversation deleted' };
  }

  async end(conversationId: string) {
    const conv = await this.findOne(conversationId);

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length > 0) {
      const contents = messages.map((m) => `${m.role}: ${m.content}`);
      this.memoryService.summarizeAndStore(conv.agentId, contents).catch(() => {});
    }

    return this.prisma.conversation.update({
      where: { id: conversationId },
      data: { endedAt: new Date() },
    });
  }

  async addMessage(conversationId: string, role: string, content: string, toolName?: string) {
    return this.prisma.message.create({
      data: { conversationId, role, content, toolName },
    });
  }
}
