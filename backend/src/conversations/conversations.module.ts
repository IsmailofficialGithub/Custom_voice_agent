import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { MemoryModule } from '../memory/memory.module';
import { AuthModule } from '../auth/auth.module';
import { LlmModule } from '../providers/llm/llm.module';

@Module({
  imports: [OrchestratorModule, MemoryModule, AuthModule, LlmModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
