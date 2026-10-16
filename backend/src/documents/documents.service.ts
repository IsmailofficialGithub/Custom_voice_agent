import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EmbeddingService } from '../providers/embedding/embedding.service';
import * as fs from 'fs';
import axios from 'axios';

const CHUNK_SIZE = 700; // target tokens (~700 words approximation)
const CHUNK_OVERLAP = 100;

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embedding: EmbeddingService,
  ) {}

  async processUpload(agentId: string, file: Express.Multer.File) {
    // Verify agent exists
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);

    // Uploading docs implies RAG — ensure the agent can search them
    if (!agent.enabledTools.includes('search_knowledge_base')) {
      await this.prisma.agent.update({
        where: { id: agentId },
        data: { enabledTools: [...agent.enabledTools, 'search_knowledge_base'] },
      });
      this.logger.log(`Enabled search_knowledge_base on agent ${agentId} after document upload`);
    }

    // Create document record
    const doc = await this.prisma.document.create({
      data: { agentId, filename: file.originalname, status: 'processing' },
    });

    // Process async — don't await
    this.ingestDocument(doc.id, file.path).catch((err) => {
      this.logger.error(`Ingestion failed for doc ${doc.id}: ${err}`);
      this.prisma.document.update({
        where: { id: doc.id },
        data: { status: 'failed' },
      }).catch(() => {});
    });

    return { id: doc.id, filename: doc.filename, status: doc.status };
  }

  async processUrlUpload(agentId: string, rawUrl: string) {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);

    let target = rawUrl.trim();
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

    if (!agent.enabledTools.includes('search_knowledge_base')) {
      await this.prisma.agent.update({
        where: { id: agentId },
        data: { enabledTools: [...agent.enabledTools, 'search_knowledge_base'] },
      });
      this.logger.log(`Enabled search_knowledge_base on agent ${agentId} after URL import`);
    }

    const doc = await this.prisma.document.create({
      data: { agentId, filename: target, status: 'processing' },
    });

    this.ingestUrl(doc.id, target).catch((err) => {
      this.logger.error(`URL ingestion failed for doc ${doc.id}: ${err}`);
      this.prisma.document.update({
        where: { id: doc.id },
        data: { status: 'failed' },
      }).catch(() => {});
    });

    return { id: doc.id, filename: doc.filename, status: doc.status };
  }

  private async ingestDocument(documentId: string, filePath: string): Promise<void> {
    const text = await this.extractPdfText(filePath);

    const chunks = this.chunkText(text);
    this.logger.log(`Document ${documentId}: ${chunks.length} chunks extracted`);

    if (chunks.length === 0) {
      this.logger.warn(`No text chunks extracted for document ${documentId}`);
      await this.prisma.document.update({
        where: { id: documentId },
        data: { status: 'failed' },
      });
      return;
    }

    // Embed all chunks
    const embeddings = await this.embedding.embedBatch(chunks);

    // Insert chunks with embeddings via raw SQL (pgvector)
    for (let i = 0; i < chunks.length; i++) {
      const embeddingStr = `[${embeddings[i].join(',')}]`;
      await this.prisma.$executeRaw`
        INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding)
        VALUES (gen_random_uuid(), ${documentId}, ${i}, ${chunks[i]}, ${embeddingStr}::vector)
      `;
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { status: 'ready' },
    });

    this.logger.log(`Document ${documentId} ingestion complete`);
  }

  private async ingestUrl(documentId: string, url: string): Promise<void> {
    let text = '';
    try {
      this.logger.log(`Ingesting URL via Jina Reader: ${url}`);
      const res = await axios.get(`https://r.jina.ai/${url}`, {
        headers: { Accept: 'text/plain', 'X-Return-Format': 'text' },
        timeout: 15000,
      });
      if (res.status === 200 && typeof res.data === 'string' && res.data.length > 50) {
        text = res.data;
      }
    } catch (err: any) {
      this.logger.warn(`Jina Reader failed for ${url}: ${err?.message}, attempting fallback fetch`);
    }

    if (!text) {
      const res = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        timeout: 10000,
      });
      const html = typeof res.data === 'string' ? res.data : '';
      text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }

    const chunks = this.chunkText(text);
    if (chunks.length === 0) {
      this.logger.warn(`No text chunks extracted for URL doc ${documentId}`);
      await this.prisma.document.update({ where: { id: documentId }, data: { status: 'failed' } });
      return;
    }

    const embeddings = await this.embedding.embedBatch(chunks);
    for (let i = 0; i < chunks.length; i++) {
      const embeddingStr = `[${embeddings[i].join(',')}]`;
      await this.prisma.$executeRaw`
        INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding)
        VALUES (gen_random_uuid(), ${documentId}, ${i}, ${chunks[i]}, ${embeddingStr}::vector)
      `;
    }

    await this.prisma.document.update({ where: { id: documentId }, data: { status: 'ready' } });
    this.logger.log(`URL Document ${documentId} ingestion complete (${chunks.length} chunks)`);
  }

  private async extractPdfText(filePath: string): Promise<string> {
    const buffer = fs.readFileSync(filePath);
    let extractedText = '';
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfModule = require('pdf-parse');
      if (typeof pdfModule === 'function') {
        const parsed = await pdfModule(buffer);
        if (parsed.text) extractedText = parsed.text;
      } else if (pdfModule.PDFParse) {
        const parser = new pdfModule.PDFParse({ data: buffer });
        const res = await parser.getText();
        if (res.pages && Array.isArray(res.pages)) {
          const pageTexts = res.pages.map((p: { text?: string }) => p.text).filter(Boolean);
          if (pageTexts.length > 0) extractedText = pageTexts.join('\n');
        }
        if (!extractedText && res.text) extractedText = res.text;
      } else if (pdfModule.default && typeof pdfModule.default === 'function') {
        const parsed = await pdfModule.default(buffer);
        if (parsed.text) extractedText = parsed.text;
      }
    } catch (err) {
      this.logger.warn(`PDF parse warning: ${err}`);
    }

    const cleanedExtracted = extractedText.replace(/--\s*\d+\s*of\s*\d+\s*--/gi, '').trim();
    if (cleanedExtracted.length > 20) {
      return cleanedExtracted;
    }

    // Fallback: extract text tokens directly from PDF stream operators
    const rawString = buffer.toString('utf-8');
    const tjMatches = [...rawString.matchAll(/\(([^)]+)\)\s*Tj/g)].map((m) => m[1]);
    if (tjMatches.length > 0) {
      return tjMatches.join(' ');
    }

    return rawString;
  }

  private chunkText(text: string): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const chunks: string[] = [];

    for (let i = 0; i < words.length; i += CHUNK_SIZE - CHUNK_OVERLAP) {
      const chunk = words.slice(i, i + CHUNK_SIZE).join(' ');
      if (chunk.trim().length > 0) chunks.push(chunk);
      if (i + CHUNK_SIZE >= words.length) break;
    }

    return chunks;
  }

  async findAllByAgent(agentId: string) {
    return this.prisma.document.findMany({
      where: { agentId },
      orderBy: { uploadedAt: 'desc' },
    });
  }

  /** Move a document so only the new agent can search it */
  async reassign(id: string, newAgentId: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);

    const agent = await this.prisma.agent.findUnique({ where: { id: newAgentId } });
    if (!agent) throw new NotFoundException(`Agent ${newAgentId} not found`);

    if (!agent.enabledTools.includes('search_knowledge_base')) {
      await this.prisma.agent.update({
        where: { id: newAgentId },
        data: { enabledTools: [...agent.enabledTools, 'search_knowledge_base'] },
      });
    }

    return this.prisma.document.update({
      where: { id },
      data: { agentId: newAgentId },
    });
  }

  async remove(id: string) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException(`Document ${id} not found`);
    await this.prisma.document.delete({ where: { id } });
    return { message: `Document ${id} deleted` };
  }
}
