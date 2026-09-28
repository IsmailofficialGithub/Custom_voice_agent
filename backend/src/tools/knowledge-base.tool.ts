import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../providers/embedding/embedding.service';
import { ToolResult } from './time.tool';

@Injectable()
export class KnowledgeBaseTool {
  private readonly logger = new Logger(KnowledgeBaseTool.name);

  readonly name = 'search_knowledge_base';
  readonly description =
    "Search this agent's uploaded PDFs (resumes, docs, knowledge base). Always use for questions about uploaded files, resumes, or document contents.";
  readonly parameters = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query to find relevant document passages',
      },
    },
    required: ['query'],
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  async execute(input: { query: string }, agentId: string): Promise<ToolResult> {
    try {
      const queryEmbedding = await this.embedding.embed(input.query);
      const embeddingStr = `[${queryEmbedding.join(',')}]`;

      const chunks = await this.prisma.$queryRaw<
        { content: string; similarity: number }[]
      >`
        SELECT dc.content, 1 - (dc.embedding <=> ${embeddingStr}::vector) AS similarity
        FROM document_chunks dc
        JOIN documents d ON d.id::text = dc.document_id::text
        WHERE d.agent_id::text = ${agentId}::text AND d.status = 'ready'
        ORDER BY dc.embedding <=> ${embeddingStr}::vector
        LIMIT 5
      `;

      if (chunks.length === 0) {
        return { success: true, data: [] };
      }

      return { success: true, data: chunks };
    } catch (err) {
      this.logger.error(`search_knowledge_base failed: ${err}`);
      return { success: false, error: "Couldn't search documents right now" };
    }
  }
}
