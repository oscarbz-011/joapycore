import { ConfigService } from '@nestjs/config';
import { TenantContext } from '../../prisma/tenant-context';
import { SessionStateCache } from '../services/session-state.cache';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  const payload = {
    sub: 'user-1',
    tenantId: 'tenant-1',
    tenantName: 'Empresa',
    email: 'a@b.c',
    roles: [],
    permissions: [],
    activeModules: [],
  };

  function strategy(get: jest.Mock) {
    const config = { getOrThrow: () => 'secret' } as unknown as ConfigService;
    return new JwtStrategy(config, { get } as unknown as SessionStateCache);
  }

  it('sets the tenant of the token before reading the session', async () => {
    let tenantDuringLookup: string | undefined;
    const get = jest.fn(() => {
      tenantDuringLookup = TenantContext.get();
      return Promise.resolve({
        userActive: true,
        tenantActive: true,
        sessionsValidAfter: null,
        roles: ['Owner'],
        permissions: ['sales:read'],
      });
    });

    const user = await TenantContext.runRequest(() =>
      strategy(get).validate(payload),
    );

    expect(tenantDuringLookup).toBe('tenant-1');
    expect(user.permissions).toEqual(['sales:read']);
  });
});
