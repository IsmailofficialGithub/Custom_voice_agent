import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentsService } from './agents.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AgentsService', () => {
  let service: AgentsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      agent: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    };
    service = new AgentsService(prisma as unknown as PrismaService);
  });

  it('creates an agent with provided startPhrase, endPhrase, and farewellMessage', async () => {
    const dto = {
      name: 'Custom Agent',
      systemPrompt: 'You are an assistant',
      enabledTools: [],
      startPhrase: 'hey boss',
      endPhrase: 'stop listening',
      farewellMessage: 'See ya!',
    };

    prisma.agent.create.mockResolvedValue({ id: '1', ...dto });

    await service.create(dto);

    expect(prisma.agent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Custom Agent',
        startPhrase: 'hey boss',
        endPhrase: 'stop listening',
        farewellMessage: 'See ya!',
      }),
    });
  });

  it('defaults startPhrase to "hey boss", endPhrase to "goodbye", and farewellMessage when omitted', async () => {
    const dto = {
      name: 'Default Agent',
      systemPrompt: 'You are an assistant',
      enabledTools: [],
    };

    prisma.agent.create.mockResolvedValue({ id: '2', ...dto });

    await service.create(dto as any);

    expect(prisma.agent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Default Agent',
        startPhrase: 'hey boss',
        endPhrase: 'goodbye',
        farewellMessage: 'Goodbye! Talk to you soon.',
      }),
    });
  });

  it('updates startPhrase, endPhrase, and farewellMessage correctly', async () => {
    prisma.agent.findUnique.mockResolvedValue({ id: '1', name: 'Existing Agent' });
    prisma.agent.update.mockResolvedValue({ id: '1', startPhrase: 'wake up' });

    await service.update('1', {
      startPhrase: 'wake up',
      endPhrase: 'shut down',
      farewellMessage: 'Catch you later!',
    });

    expect(prisma.agent.update).toHaveBeenCalledWith({
      where: { id: '1' },
      data: expect.objectContaining({
        startPhrase: 'wake up',
        endPhrase: 'shut down',
        farewellMessage: 'Catch you later!',
      }),
    });
  });
});
