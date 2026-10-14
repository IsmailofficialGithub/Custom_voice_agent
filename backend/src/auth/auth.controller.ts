import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';
import { ApiKeyGuard } from './api-key.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('setup-status')
  getSetupStatus() {
    return this.auth.getSetupStatus();
  }

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.auth.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() body: LoginDto) {
    return this.auth.login(body.email, body.password);
  }

  @Get('me')
  @UseGuards(ApiKeyGuard)
  getMe(@Headers('authorization') authHeader: string) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    return this.auth.getMe(token);
  }
}
