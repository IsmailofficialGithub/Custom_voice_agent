import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAgentDto, UpdateAgentDto } from './agents.dto';

@Injectable()
export class AgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        name: dto.name,
        systemPrompt: dto.systemPrompt,
        enabledTools: dto.enabledTools,
        llmProvider: dto.llmProvider ?? 'claude',
        llmModel: dto.llmModel ?? 'claude-sonnet-4-5',
        ttsVoice: dto.ttsVoice ?? 'alloy',
        ttsGender: dto.ttsGender ?? 'neutral',
        startPhrase: dto.startPhrase?.trim() || 'hey boss',
        endPhrase: dto.endPhrase?.trim() || 'goodbye',
        farewellMessage: dto.farewellMessage?.trim() || 'Goodbye! Talk to you soon.',
      },
    });
  }

  async findAll() {
    return this.prisma.agent.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new NotFoundException(`Agent ${id} not found`);
    return agent;
  }

  async update(id: string, dto: UpdateAgentDto) {
    await this.findOne(id);
    return this.prisma.agent.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.systemPrompt && { systemPrompt: dto.systemPrompt }),
        ...(dto.enabledTools && { enabledTools: dto.enabledTools }),
        ...(dto.llmProvider && { llmProvider: dto.llmProvider }),
        ...(dto.llmModel && { llmModel: dto.llmModel }),
        ...(dto.ttsVoice && { ttsVoice: dto.ttsVoice }),
        ...(dto.ttsGender && { ttsGender: dto.ttsGender }),
        ...(dto.startPhrase !== undefined && { startPhrase: dto.startPhrase.trim() }),
        ...(dto.endPhrase !== undefined && { endPhrase: dto.endPhrase.trim() }),
        ...(dto.farewellMessage !== undefined && { farewellMessage: dto.farewellMessage.trim() }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.agent.delete({ where: { id } });
    return { message: `Agent ${id} deleted` };
  }
}
