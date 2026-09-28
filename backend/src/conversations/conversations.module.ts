import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [OrchestratorModule, MemoryModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
