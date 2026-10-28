import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { ApiKeyGuard, AdminGuard } from './api-key.guard';

const operator = { id: 'u1', role: 'operator', assignedAgentIds: ['a1'] };

function ctx(req: any) {
  return { switchToHttp: () => ({ getRequest: () => req }) } as any;
}

function makeGuard(user: any) {
  const auth = {
    resolveUser: vi.fn().mockResolvedValue(user),
    canAccessAgent: (u: any, id: string) => u.role === 'admin' || u.assignedAgentIds.includes(id),
  };
  const prisma = {
    conversation: { findUnique: vi.fn().mockResolvedValue({ agentId: 'a2' }) },
    document: { findUnique: vi.fn().mockResolvedValue({ agentId: 'a1' }) },
  };
  return new ApiKeyGuard(auth as any, prisma as any);
}

const req = (path: string, params: any, body?: any) => ({
  headers: { authorization: 'Bearer t' }, route: { path }, params, body,
});

describe('ApiKeyGuard agent scoping', () => {
  it('allows an assigned agent', async () => {
    await expect(makeGuard(operator).canActivate(ctx(req('/api/v1/agents/:id', { id: 'a1' })))).resolves.toBe(true);
  });
  it('blocks an unassigned agent', async () => {
    await expect(makeGuard(operator).canActivate(ctx(req('/api/v1/agents/:agentId/documents', { agentId: 'a2' }))))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
  it('blocks a conversation belonging to an unassigned agent', async () => {
    await expect(makeGuard(operator).canActivate(ctx(req('/api/v1/conversations/:id/messages', { id: 'c1' }))))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
  it('blocks moving a document to an unassigned agent', async () => {
    await expect(makeGuard(operator).canActivate(ctx(req('/api/v1/documents/:id', { id: 'd1' }, { agentId: 'a2' }))))
      .rejects.toBeInstanceOf(ForbiddenException);
  });
  it('lets admins through and AdminGuard rejects operators', async () => {
    await expect(makeGuard({ ...operator, role: 'admin' }).canActivate(ctx(req('/api/v1/agents/:id', { id: 'a9' })))).resolves.toBe(true);
    expect(() => new AdminGuard().canActivate(ctx({ user: operator }))).toThrow(ForbiddenException);
  });
});
