import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { LlmModule } from '../providers/llm/llm.module';

@Module({
  imports: [LlmModule],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
