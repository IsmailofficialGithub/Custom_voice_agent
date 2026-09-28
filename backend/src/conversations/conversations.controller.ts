import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { CreateConversationDto, SendMessageDto, UpdateConversationDto } from './conversations.dto';

@UseGuards(ApiKeyGuard)
@Controller()
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly orchestratorService: OrchestratorService,
  ) {}

  @Post('agents/:agentId/conversations')
  @HttpCode(HttpStatus.CREATED)
  create(@Param('agentId') agentId: string, @Body() dto: CreateConversationDto) {
    return this.conversationsService.create(agentId, dto);
  }

  @Get('agents/:agentId/conversations')
  findAll(@Param('agentId') agentId: string) {
    return this.conversationsService.findAllByAgent(agentId);
  }

  @Get('conversations/:id/messages')
  getMessages(@Param('id') id: string) {
    return this.conversationsService.getMessages(id);
  }

  @Patch('conversations/:id')
  update(@Param('id') id: string, @Body() dto: UpdateConversationDto) {
    return this.conversationsService.update(id, dto);
  }

  @Delete('conversations/:id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.conversationsService.delete(id);
  }

  @Post('conversations/:id/messages')
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Param('id') id: string, @Body() dto: SendMessageDto) {
    return this.orchestratorService.handleTextTurn(id, dto.content);
  }

  @Post('conversations/:id/end')
  @HttpCode(HttpStatus.OK)
  end(@Param('id') id: string) {
    return this.conversationsService.end(id);
  }
}
