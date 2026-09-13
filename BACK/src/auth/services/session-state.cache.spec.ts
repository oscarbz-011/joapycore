import { UnauthorizedException } from '@nestjs/common';
import { TenantStatus, UserStatus } from '@prisma/client';
import { JwtStrategy } from '../strategies/jwt.strategy';
import { issuedBeforeCutoff, SessionStateCache } from './session-state.cache';

const nowSec = () => Math.floor(Date.now() / 1000);

function setup(
  overrides: {
    user?: Record<string, unknown> | null;
    tenantStatus?: TenantStatus;
  } = {},
) {
  const user =
    overrides.user === null
      ? null
      : {
          id: 'u1',
          tenantId: 't1',
          status: UserStatus.ACTIVE,
          deletedAt: null,
          sessionsValidAfter: null,
          ...overrides.user,
        };
  const usersRepository = {
    findByIdForAuth: jest.fn().mockResolvedValue(user),
  };
  const tenantsRepository = {
    findById: jest.fn().mockResolvedValue({
      id: 't1',
      status: overrides.tenantStatus ?? TenantStatus.ACTIVE,
    }),
  };
  const permissionsResolver = {
    resolve: jest
      .fn()
      .mockResolvedValue({ roles: ['Vendedor'], permissions: ['sales:read'] }),
  };
  const cache = new SessionStateCache(
    usersRepository as never,
    tenantsRepository as never,
    permissionsResolver as never,
  );
  const config = { getOrThrow: () => 'x'.repeat(32) };
  const strategy = new JwtStrategy(config as never, cache);
  return { cache, strategy, usersRepository, permissionsResolver };
}

const payload = (iat = nowSec()) => ({
  sub: 'u1',
  tenantId: 't1',
  tenantName: 'Acme',
  email: 'a@b.c',
  roles: ['Owner'],
  permissions: ['sales:read', 'sales:manage', 'config:manage'],
  activeModules: [],
  iat,
});

describe('JwtStrategy + SessionStateCache', () => {
  it('replaces the permissions baked in the token with the current ones', async () => {
    const { strategy } = setup();
    const result = await strategy.validate(payload());
    expect(result.permissions).toEqual(['sales:read']);
    expect(result.roles).toEqual(['Vendedor']);
  });

  it('rejects a deactivated user even with a valid token', async () => {
    const { strategy } = setup({ user: { status: UserStatus.INACTIVE } });
    await expect(strategy.validate(payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a user that no longer exists', async () => {
    const { strategy } = setup({ user: null });
    await expect(strategy.validate(payload())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects users of a suspended tenant', async () => {
    const { strategy } = setup({ tenantStatus: TenantStatus.SUSPENDED });
    await expect(strategy.validate(payload())).rejects.toThrow(
      'La empresa está suspendida',
    );
  });

  it('rejects tokens issued before the session cutoff and accepts newer ones', async () => {
    const cutoff = new Date(Date.now() - 10_000);
    const { strategy } = setup({ user: { sessionsValidAfter: cutoff } });
    await expect(strategy.validate(payload(nowSec() - 3600))).rejects.toThrow(
      'La sesión fue cerrada',
    );
    await expect(strategy.validate(payload(nowSec()))).resolves.toBeDefined();
  });

  it('caches the state and reloads it after an invalidation event', async () => {
    const { cache, usersRepository, permissionsResolver } = setup();
    await cache.get('u1');
    await cache.get('u1');
    expect(usersRepository.findByIdForAuth).toHaveBeenCalledTimes(1);

    permissionsResolver.resolve.mockResolvedValue({
      roles: [],
      permissions: [],
    });
    cache.invalidate({ userId: 'u1' });
    const state = await cache.get('u1');
    expect(usersRepository.findByIdForAuth).toHaveBeenCalledTimes(2);
    expect(state?.permissions).toEqual([]);
  });

  it('invalidates every cached user of a tenant', async () => {
    const { cache, usersRepository } = setup();
    await cache.get('u1');
    cache.invalidate({ tenantId: 't1' });
    await cache.get('u1');
    expect(usersRepository.findByIdForAuth).toHaveBeenCalledTimes(2);
  });
});

describe('issuedBeforeCutoff', () => {
  it('is false when there is no cutoff', () => {
    expect(issuedBeforeCutoff(1, null)).toBe(false);
  });

  it('keeps valid a token issued in the same second as the cutoff', () => {
    const cutoff = new Date('2026-09-13T12:00:00.900Z');
    expect(
      issuedBeforeCutoff(Math.floor(cutoff.getTime() / 1000), cutoff),
    ).toBe(false);
    expect(
      issuedBeforeCutoff(Math.floor(cutoff.getTime() / 1000) - 1, cutoff),
    ).toBe(true);
  });
});
