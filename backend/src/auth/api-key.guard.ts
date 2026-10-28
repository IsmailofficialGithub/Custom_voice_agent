import { Injectable, CanActivate, ExecutionContext, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { Request } from 'express';
import { AuthService, RequestUser } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

export type AuthedRequest = Request & { user: RequestUser };

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const authHeader = request.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or invalid Authorization header');
    }

    const user = await this.auth.resolveUser(authHeader.slice(7));
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }
    request.user = user;

    if (user.role !== 'admin') {
      const agentId = await this.targetAgentId(request);
      if (agentId && !this.auth.canAccessAgent(user, agentId)) {
        throw new ForbiddenException('You do not have access to this agent');
      }
      // Moving a document to another agent requires access to the destination too.
      const bodyAgentId = (request.body as { agentId?: unknown } | undefined)?.agentId;
      if (typeof bodyAgentId === 'string' && !this.auth.canAccessAgent(user, bodyAgentId)) {
        throw new ForbiddenException('You do not have access to this agent');
      }
    }

    return true;
  }

  // Maps a route's params to the agent it touches, so per-user agent access is enforced in one place.
  private async targetAgentId(req: Request): Promise<string | null> {
    const { agentId, id } = (req.params ?? {}) as Record<string, string | undefined>;
    if (agentId) return agentId;
    if (!id) return null;
    const path: string = req.route?.path ?? req.path;
    if (/\/agents\/:id/.test(path)) return id;
    if (/\/conversations\/:id/.test(path)) {
      const c = await this.prisma.conversation.findUnique({ where: { id }, select: { agentId: true } });
      return c?.agentId ?? id; // unknown id -> deny unless assigned (never matches)
    }
    if (/\/documents\/:id/.test(path)) {
      const d = await this.prisma.document.findUnique({ where: { id }, select: { agentId: true } });
      return d?.agentId ?? id;
    }
    return null;
  }
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    if (request.user?.role !== 'admin') throw new ForbiddenException('Admin access required');
    return true;
  }
}
