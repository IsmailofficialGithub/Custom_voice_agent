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
    return this.auth.login(body.email, body.password, body.twoFactorCode);
  }

  @Get('me')
  @UseGuards(ApiKeyGuard)
  getMe(@Headers('authorization') authHeader: string) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    return this.auth.getMe(token);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  changePassword(
    @Headers('authorization') authHeader: string,
    @Body() body: { currentPassword: string; newPassword: string; twoFactorCode?: string },
  ) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    return this.auth.changePassword(token, body.currentPassword, body.newPassword, body.twoFactorCode);
  }

  @Get('2fa/generate')
  @UseGuards(ApiKeyGuard)
  generateTwoFactor(@Headers('authorization') authHeader: string) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    return this.auth.generateTwoFactorSecret(token);
  }

  @Post('2fa/enable')
  @UseGuards(ApiKeyGuard)
  enableTwoFactor(
    @Headers('authorization') authHeader: string,
    @Body() body: { secret: string; code: string },
  ) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    return this.auth.enableTwoFactor(token, body.secret, body.code);
  }

  @Post('2fa/disable')
  @UseGuards(ApiKeyGuard)
  disableTwoFactor(
    @Headers('authorization') authHeader: string,
    @Body() body: { code: string },
  ) {
    const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
    return this.auth.disableTwoFactor(token, body.code);
  }
}

