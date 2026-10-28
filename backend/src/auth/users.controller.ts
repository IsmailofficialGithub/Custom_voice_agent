import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AdminGuard, ApiKeyGuard, AuthedRequest } from './api-key.guard';

@UseGuards(ApiKeyGuard, AdminGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  findAll() {
    return this.auth.listUsers();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() body: { email: string; password: string; name?: string; role?: string }) {
    return this.auth.createUser(body);
  }

  @Patch(':userId')
  update(
    @Req() req: AuthedRequest,
    @Param('userId') userId: string,
    @Body() body: { name?: string; role?: string; assignedAgentIds?: string[] },
  ) {
    return this.auth.updateUser(req.user.id, userId, body);
  }

  @Post(':userId/reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Param('userId') userId: string, @Body() body: { password: string }) {
    return this.auth.adminResetPassword(userId, body.password);
  }

  @Delete(':userId')
  remove(@Req() req: AuthedRequest, @Param('userId') userId: string) {
    return this.auth.deleteUser(req.user.id, userId);
  }
}
