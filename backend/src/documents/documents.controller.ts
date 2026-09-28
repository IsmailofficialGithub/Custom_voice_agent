import {
  Controller, Post, Get, Delete, Patch, Param, Body, UseGuards,
  UseInterceptors, UploadedFile, HttpCode, HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ApiKeyGuard } from '../auth/api-key.guard';
import { DocumentsService } from './documents.service';

@UseGuards(ApiKeyGuard)
@Controller()
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  // POST /api/v1/agents/:agentId/documents
  @Post('agents/:agentId/documents')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: process.env.UPLOAD_DIR ?? './uploads',
        filename: (_req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
      fileFilter: (_req, file, cb) => {
        if (file.mimetype !== 'application/pdf') {
          cb(new Error('Only PDF files are allowed'), false);
        } else {
          cb(null, true);
        }
      },
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
    }),
  )
  async upload(@Param('agentId') agentId: string, @UploadedFile() file: Express.Multer.File) {
    return this.documentsService.processUpload(agentId, file);
  }

  // GET /api/v1/agents/:agentId/documents
  @Get('agents/:agentId/documents')
  findAll(@Param('agentId') agentId: string) {
    return this.documentsService.findAllByAgent(agentId);
  }

  // PATCH /api/v1/documents/:id  { agentId } — reassign to another agent
  @Patch('documents/:id')
  @HttpCode(HttpStatus.OK)
  reassign(@Param('id') id: string, @Body() body: { agentId: string }) {
    return this.documentsService.reassign(id, body.agentId);
  }

  // DELETE /api/v1/documents/:id
  @Delete('documents/:id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id') id: string) {
    return this.documentsService.remove(id);
  }
}
