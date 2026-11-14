import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

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
