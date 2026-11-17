import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import * as tenantRls from './tenant-rls';

describe('PrismaService.warnIfPrivileged', () => {
  let prisma: PrismaService;
  let warn: jest.SpyInstance;

  beforeEach(() => {
    prisma = new PrismaService(
      new ConfigService({ DATABASE_URL: 'postgresql://u:p@localhost/db' }),
    );
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(async () => {
    warn.mockRestore();
    await prisma.onModuleDestroy();
  });

  const unprivileged = {
    name: 'app',
    superuser: false,
    bypassRls: false,
    canCreate: false,
    ownsTables: false,
  };
  const connectedAs = (role: object) =>
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue([role]);

  it.each([
    [{ superuser: true }, 'es superusuario'],
    [{ bypassRls: true }, 'se saltea las políticas de filas'],
    [{ ownsTables: true }, 'es dueño de las tablas'],
    [{ canCreate: true }, 'puede crear tablas'],
  ])('warns when the connection user %o', async (attrs, reason) => {
    connectedAs({ ...unprivileged, name: 'postgres', ...attrs });
    await prisma.warnIfPrivileged();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`"postgres", que ${reason}`),
    );
  });

  it('refuses to start in production with a privileged user', async () => {
    const production = new PrismaService(
      new ConfigService({
        DATABASE_URL: 'postgresql://u:p@localhost/db',
        NODE_ENV: 'production',
      }),
    );
    jest
      .spyOn(production, '$queryRaw')
      .mockResolvedValue([
        { ...unprivileged, name: 'postgres', superuser: true },
      ]);
    await expect(production.warnIfPrivileged()).rejects.toThrow(
      '"postgres", que es superusuario',
    );
    await production.onModuleDestroy();
  });

  it('stays quiet for an unprivileged user', async () => {
    connectedAs(unprivileged);
    await prisma.warnIfPrivileged();
    expect(warn).not.toHaveBeenCalled();
  });

  it('does not stop the startup when the check fails', async () => {
    jest
      .spyOn(prisma, '$queryRaw')
      .mockRejectedValue(new Error('connection lost'));
    await expect(prisma.warnIfPrivileged()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('connection lost'),
    );
  });
});

describe('PrismaService.checkTenantRls', () => {
  const build = (env: Record<string, string> = {}) =>
    new PrismaService(
      new ConfigService({
        DATABASE_URL: 'postgresql://u:p@localhost/db',
        ...env,
      }),
    );
  let warn: jest.SpyInstance;
  let unprotected: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
    unprotected = jest.spyOn(tenantRls, 'unprotectedTenantTables');
  });

  afterEach(() => {
    warn.mockRestore();
    unprotected.mockRestore();
  });

  it('refuses to start in production with an unprotected tenant table', async () => {
    const prisma = build({ NODE_ENV: 'production' });
    unprotected.mockResolvedValue(['customers']);
    await expect(prisma.checkTenantRls()).rejects.toThrow('customers');
    await prisma.onModuleDestroy();
  });

  it('only warns outside production', async () => {
    const prisma = build();
    unprotected.mockResolvedValue(['customers']);
    await prisma.checkTenantRls();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('customers'));
    await prisma.onModuleDestroy();
  });

  it('skips the check when TENANT_RLS is off', async () => {
    const prisma = build({ NODE_ENV: 'production', TENANT_RLS: 'off' });
    await prisma.checkTenantRls();
    expect(unprotected).not.toHaveBeenCalled();
    await prisma.onModuleDestroy();
  });
});
