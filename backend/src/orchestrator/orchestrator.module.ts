import { Module } from '@nestjs/common';
import { OrchestratorService } from './orchestrator.service';
import { LlmModule } from '../providers/llm/llm.module';
import { ToolsModule } from '../tools/tools.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [LlmModule, ToolsModule, MemoryModule],
  providers: [OrchestratorService],
  exports: [OrchestratorService],
})
export class OrchestratorModule {}
