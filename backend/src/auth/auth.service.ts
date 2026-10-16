import { Injectable, UnauthorizedException, ConflictException, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { generateSecret, generateURI, verifySync } from 'otplib';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './register.dto';

export interface UserSessionPayload {
  token?: string;
  email: string;
  requiresTwoFactor?: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
    isTwoFactorEnabled?: boolean;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  jwtSecret(): string {
    return (this.config.get<string>('AUTH_JWT_SECRET') || this.config.get<string>('API_KEY') || 'default-jwt-secret-key').trim();
  }

  apiKey(): string {
    return (this.config.get<string>('API_KEY') ?? '').trim().replace(/^["']|["']$/g, '');
  }

  envEmail(): string {
    return (this.config.get<string>('AUTH_EMAIL') ?? '').trim().toLowerCase();
  }

  envPassword(): string {
    return (this.config.get<string>('AUTH_PASSWORD') ?? '').trim();
  }

  hashPassword(password: string): string {
    const salt = randomBytes(16).toString('hex');
    const derivedKey = scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${derivedKey}`;
  }

  verifyPassword(password: string, storedHash: string): boolean {
    if (!storedHash || !storedHash.includes(':')) return false;
    try {
      const [salt, key] = storedHash.split(':');
      if (!salt || !key) return false;
      const keyBuffer = Buffer.from(key, 'hex');
      const derivedBuffer = scryptSync(password, salt, 64);
      if (keyBuffer.length !== derivedBuffer.length) return false;
      return timingSafeEqual(keyBuffer, derivedBuffer);
    } catch {
      return false;
    }
  }

  async getSetupStatus(): Promise<{ isSetup: boolean; userCount: number }> {
    try {
      const count = await this.prisma.user.count();
      return { isSetup: count > 0, userCount: count };
    } catch {
      return { isSetup: false, userCount: 0 };
    }
  }

  async register(dto: RegisterDto): Promise<UserSessionPayload> {
    const email = dto.email.trim().toLowerCase();
    const existing = await this.prisma.user.findUnique({ where: { email } }).catch(() => null);
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const count = await this.prisma.user.count().catch(() => 0);
    const passwordHash = this.hashPassword(dto.password);
    const name = dto.name?.trim() || email.split('@')[0];

    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        role: count === 0 ? 'admin' : 'operator',
      },
    });

    const token = this.createSessionToken(user.id, user.email, user.role);
    return {
      token,
      email: user.email,
      user: {
        id: user.id,
        email: user.email,
        name: user.name || name,
        role: user.role,
      },
    };
  }

  async login(email: string, password: string, twoFactorCode?: string): Promise<UserSessionPayload> {
    const gotEmail = (email ?? '').trim().toLowerCase();
    const gotPass = (password ?? '').trim();

    if (!gotEmail || !gotPass) {
      throw new UnauthorizedException('Email and password are required');
    }

    // 1. Check Database user table
    const dbUser = await this.prisma.user.findUnique({ where: { email: gotEmail } }).catch(() => null);
    if (dbUser) {
      const matches = this.verifyPassword(gotPass, dbUser.passwordHash);
      if (!matches) {
        throw new UnauthorizedException('Invalid email or password');
      }

      // If user has 2FA enabled:
      if (dbUser.isTwoFactorEnabled) {
        if (!twoFactorCode || !twoFactorCode.trim()) {
          return {
            email: dbUser.email,
            requiresTwoFactor: true,
          };
        }

        const cleanCode = twoFactorCode.trim().replace(/\s+/g, '');
        const res = verifySync({ token: cleanCode, secret: dbUser.twoFactorSecret || '' });
        if (!res?.valid) {
          throw new UnauthorizedException('Invalid two-factor authentication code');
        }
      }

      const token = this.createSessionToken(dbUser.id, dbUser.email, dbUser.role);
      return {
        token,
        email: dbUser.email,
        user: {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name || dbUser.email.split('@')[0],
          role: dbUser.role,
          isTwoFactorEnabled: Boolean(dbUser.isTwoFactorEnabled),
        },
      };
    }

    // 2. Fallback check against environment credentials (if configured)
    const expectedEmail = this.envEmail();
    const expectedPass = this.envPassword();
    if (expectedEmail && expectedPass && this.safeEqual(gotEmail, expectedEmail) && this.safeEqual(gotPass, expectedPass)) {
      // Migrate to database automatically so future auth lives in database
      const migrated = await this.prisma.user
        .create({
          data: {
            email: gotEmail,
            passwordHash: this.hashPassword(gotPass),
            name: gotEmail.split('@')[0],
            role: 'admin',
          },
        })
        .catch(() => null);

      const userId = migrated?.id || 'env-admin';
      const token = this.createSessionToken(userId, gotEmail, 'admin');
      return {
        token,
        email: gotEmail,
        user: {
          id: userId,
          email: gotEmail,
          name: gotEmail.split('@')[0],
          role: 'admin',
          isTwoFactorEnabled: false,
        },
      };
    }

    throw new UnauthorizedException('Invalid email or password');
  }

  async getMe(token: string) {
    if (!token) throw new UnauthorizedException('Token missing');
    if (token === this.apiKey()) {
      return {
        id: 'api-key-user',
        email: 'dev@axiomra.ai',
        name: 'Developer',
        role: 'admin',
        isTwoFactorEnabled: false,
      };
    }

    try {
      const payload = this.jwt.verify<{ sub: string; email?: string; role?: string }>(token, {
        secret: this.jwtSecret(),
      });
      if (payload.sub) {
        const user = await this.prisma.user.findUnique({ where: { id: payload.sub } }).catch(() => null);
        if (user) {
          return {
            id: user.id,
            email: user.email,
            name: user.name || user.email.split('@')[0],
            role: user.role,
            isTwoFactorEnabled: Boolean(user.isTwoFactorEnabled),
          };
        }
      }
      return {
        id: payload.sub || 'user',
        email: payload.email || '',
        name: payload.email ? payload.email.split('@')[0] : 'User',
        role: payload.role || 'admin',
        isTwoFactorEnabled: false,
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired session token');
    }
  }

  async generateTwoFactorSecret(token: string) {
    const me = await this.getMe(token);
    if (!me || me.id === 'api-key-user') {
      throw new BadRequestException('Two-factor authentication requires a user account');
    }

    const secret = generateSecret();
    const issuer = this.config.get<string>('TOTP_ISSUER') || 'VoiceAgent';
    const otpauthUrl = generateURI({ issuer, label: me.email, secret });
    const qrCode = await QRCode.toDataURL(otpauthUrl);

    return {
      secret,
      qrCode,
      otpauthUrl,
    };
  }

  async enableTwoFactor(token: string, secret: string, code: string) {
    const me = await this.getMe(token);
    if (!me || me.id === 'api-key-user') {
      throw new BadRequestException('Two-factor authentication requires a user account');
    }

    if (!secret || !code) {
      throw new BadRequestException('Secret and 6-digit verification code are required');
    }

    const cleanCode = code.trim().replace(/\s+/g, '');
    const res = verifySync({ token: cleanCode, secret: secret.trim() });
    if (!res?.valid) {
      throw new UnauthorizedException('Invalid verification code. Please check your authenticator app and try again.');
    }

    await this.prisma.user.update({
      where: { id: me.id },
      data: {
        isTwoFactorEnabled: true,
        twoFactorSecret: secret.trim(),
      },
    });

    return {
      success: true,
      message: 'Two-factor authentication enabled successfully',
    };
  }

  async disableTwoFactor(token: string, code: string) {
    const me = await this.getMe(token);
    if (!me || me.id === 'api-key-user') {
      throw new BadRequestException('Two-factor authentication requires a user account');
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: me.id } });
    if (!dbUser?.isTwoFactorEnabled || !dbUser.twoFactorSecret) {
      return { success: true, message: 'Two-factor authentication is already disabled' };
    }

    const cleanCode = (code || '').trim().replace(/\s+/g, '');
    const res = verifySync({ token: cleanCode, secret: dbUser.twoFactorSecret });
    if (!res?.valid) {
      throw new UnauthorizedException('Invalid verification code');
    }

    await this.prisma.user.update({
      where: { id: me.id },
      data: {
        isTwoFactorEnabled: false,
        twoFactorSecret: null,
      },
    });

    return {
      success: true,
      message: 'Two-factor authentication disabled successfully',
    };
  }

  isSessionToken(token: string): boolean {
    const clean = (token ?? '').trim().replace(/^Bearer\s+/i, '');
    if (!clean) return false;
    try {
      const payload = this.jwt.verify<{ typ?: string; sub?: string }>(clean, { secret: this.jwtSecret() });
      return payload?.typ === 'session' || Boolean(payload?.sub);
    } catch {
      return false;
    }
  }

  isValidBearer(token: string): boolean {
    const t = (token ?? '').trim().replace(/^Bearer\s+/i, '');
    if (!t) return false;
    const key = this.apiKey();
    if (key && (t === key || token.trim() === key)) return true;
    return this.isSessionToken(t);
  }

  private createSessionToken(userId: string, email: string, role: string): string {
    return this.jwt.sign(
      { sub: userId, email, role, typ: 'session' },
      { secret: this.jwtSecret(), expiresIn: '30d' },
    );
  }

  private safeEqual(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  }
}
