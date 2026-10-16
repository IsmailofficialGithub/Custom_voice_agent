import { Module } from '@nestjs/common';
import { TimeTool } from './time.tool';
import { WebSearchTool } from './web-search.tool';
import { KnowledgeBaseTool } from './knowledge-base.tool';
import { WebpageReaderTool } from './webpage-reader.tool';
import { EmbeddingModule } from '../providers/embedding/embedding.module';

@Module({
  imports: [EmbeddingModule],
  providers: [TimeTool, WebSearchTool, KnowledgeBaseTool, WebpageReaderTool],
  exports: [TimeTool, WebSearchTool, KnowledgeBaseTool, WebpageReaderTool],
})
export class ToolsModule {}
