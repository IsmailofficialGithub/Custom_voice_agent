import {
  Controller, Get, Post, Patch, Delete, Param, Body, UseGuards, HttpCode, HttpStatus, Req,
} from '@nestjs/common';
import { ConversationsService } from './conversations.service';
import { OrchestratorService } from '../orchestrator/orchestrator.service';
import { ApiKeyGuard, AuthedRequest } from '../auth/api-key.guard';
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

  @Get('call-logs')
  getCallLogsAll(@Req() req: AuthedRequest) {
    return this.conversationsService.getCallLogs(undefined, this.scope(req));
  }

  @Get('conversations/logs')
  getConversationsLogs(@Req() req: AuthedRequest) {
    return this.conversationsService.getCallLogs(undefined, this.scope(req));
  }

  @Get('agents/:agentId/call-logs')
  getAgentCallLogs(@Param('agentId') agentId: string) {
    return this.conversationsService.getCallLogs(agentId);
  }

  @Get('conversations/:id/summary')
  getConversationSummary(@Param('id') id: string) {
    return this.conversationsService.getSummary(id);
  }

  @Post('conversations/:id/end')
  @HttpCode(HttpStatus.OK)
  end(@Param('id') id: string) {
    return this.conversationsService.end(id);
  }

  private scope(req: AuthedRequest): string[] | undefined {
    return req.user.role === 'admin' ? undefined : req.user.assignedAgentIds;
  }
}
