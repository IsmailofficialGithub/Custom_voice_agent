import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { timingSafeEqual } from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {}

  envEmail(): string {
    return (this.config.get<string>('AUTH_EMAIL') ?? '').trim().toLowerCase();
  }

  envPassword(): string {
    return (this.config.get<string>('AUTH_PASSWORD') ?? '').trim();
  }

  jwtSecret(): string {
    return (this.config.get<string>('AUTH_JWT_SECRET') || this.config.get<string>('API_KEY') || '').trim();
  }

  apiKey(): string {
    return (this.config.get<string>('API_KEY') ?? '').trim().replace(/^["']|["']$/g, '');
  }

  login(email: string, password: string): { token: string; email: string } {
    const expectedEmail = this.envEmail();
    const expectedPass = this.envPassword();
    if (!expectedEmail || !expectedPass) {
      throw new UnauthorizedException('Login is not configured');
    }

    const gotEmail = (email ?? '').trim().toLowerCase();
    const gotPass = (password ?? '').trim();
    if (!this.safeEqual(gotEmail, expectedEmail) || !this.safeEqual(gotPass, expectedPass)) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = this.jwt.sign({ sub: gotEmail, typ: 'session' }, { secret: this.jwtSecret(), expiresIn: '7d' });
    return { token, email: gotEmail };
  }

  isSessionToken(token: string): boolean {
    try {
      const payload = this.jwt.verify<{ typ?: string }>(token, { secret: this.jwtSecret() });
      return payload?.typ === 'session';
    } catch {
      return false;
    }
  }

  isValidBearer(token: string): boolean {
    const t = (token ?? '').trim();
    if (!t) return false;
    const key = this.apiKey();
    if (key && t === key) return true;
    return this.isSessionToken(t);
  }

  private safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}
