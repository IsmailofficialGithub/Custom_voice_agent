import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminGuard, ApiKeyGuard } from './api-key.guard';
import { UsersController } from './users.controller';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

@Module({
  imports: [JwtModule.register({ global: true })],
  controllers: [AuthController, UsersController],
  providers: [AuthService, ApiKeyGuard, AdminGuard],
  exports: [AuthService, ApiKeyGuard, AdminGuard],
})
export class AuthModule {}
