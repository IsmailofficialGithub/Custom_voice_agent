import { Module } from '@nestjs/common';
import { VoiceGateway } from './voice.gateway';
import { OrchestratorModule } from '../orchestrator/orchestrator.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { SttModule } from '../providers/stt/stt.module';
import { TtsModule } from '../providers/tts/tts.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [OrchestratorModule, ConversationsModule, SttModule, TtsModule, AuthModule],
  providers: [VoiceGateway],
})
export class VoiceGatewayModule {}
