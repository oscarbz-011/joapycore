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

  const connectedAs = (role: object[]) =>
    jest.spyOn(prisma, '$queryRaw').mockResolvedValue(role);

  it.each([
    { superuser: true, bypassRls: false },
    { superuser: false, bypassRls: true },
  ])('warns when the connection user is privileged (%o)', async (attrs) => {
    connectedAs([{ name: 'postgres', ...attrs }]);
    await prisma.warnIfPrivileged();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"postgres"'));
  });

  it('stays quiet for an unprivileged user', async () => {
    connectedAs([{ name: 'app', superuser: false, bypassRls: false }]);
    await prisma.warnIfPrivileged();
    expect(warn).not.toHaveBeenCalled();
  });
});
