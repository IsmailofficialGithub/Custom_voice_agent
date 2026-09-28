import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../providers/embedding/embedding.service';
import { LlmProvider } from '../providers/llm/llm.interface';
import { LLM_PROVIDER } from '../providers/llm/llm.module';

@Injectable()
export class MemoryService {
  private readonly logger = new Logger(MemoryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async retrieveRelevant(agentId: string, query: string): Promise<string[]> {
    try {
      const queryEmbedding = await this.embedding.embed(query);
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      const memories = await this.prisma.$queryRaw<{ content: string }[]>`
        SELECT content, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
        FROM memories
        WHERE agent_id = ${agentId}
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT 3
      `;

      return memories.map((m) => m.content);
    } catch (err) {
      this.logger.error(`Memory retrieval failed: ${err}`);
      return [];
    }
  }

  async summarizeAndStore(agentId: string, messageContents: string[]): Promise<void> {
    try {
      const transcript = messageContents.join('\n');
      const response = await this.llm.chat([
        {
          role: 'system',
          content: 'Extract key facts, preferences, and important information from this conversation. Return only a brief bullet list of facts worth remembering for future sessions. Be concise.',
        },
        { role: 'user', content: transcript },
      ]);

      const facts = response.content
        .split('\n')
        .map((f) => f.trim())
        .filter((f) => f.length > 0);

      for (const fact of facts) {
        const embedding = await this.embedding.embed(fact);
        await this.prisma.$executeRaw`
          INSERT INTO memories (id, agent_id, content, embedding)
          VALUES (gen_random_uuid(), ${agentId}, ${fact}, ${`[${embedding.join(',')}]`}::vector)
        `;
      }

      this.logger.log(`Stored ${facts.length} memory entries for agent ${agentId}`);
    } catch (err) {
      this.logger.error(`Memory summarization failed: ${err}`);
    }
  }
}
