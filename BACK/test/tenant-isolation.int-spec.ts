import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { TenantContext } from '../src/prisma/tenant-context';
import { unprotectedTenantTables } from '../src/prisma/tenant-rls';

// Con el usuario sin privilegios (CI lo separa del dueño): el dueño de las
// tablas no queda sujeto a la seguridad de filas.
const describeAsApp = process.env.MIGRATE_DATABASE_URL
  ? describe
  : describe.skip;

describeAsApp('seguridad de filas por empresa', () => {
  const prisma = new PrismaService(
    new ConfigService({ DATABASE_URL: process.env.DATABASE_URL }),
  );
  const [tenantA, tenantB] = [randomUUID(), randomUUID()];
  let customerB: string;

  const customer = (tenantId: string) => ({
    tenantId,
    firstName: 'Cliente',
    lastName: tenantId.slice(0, 8),
    customerCode: `CLI-${randomUUID().slice(0, 8)}`,
  });

  beforeAll(async () => {
    await prisma.$connect();
    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: `TEST rls A ${tenantA}` },
        { id: tenantB, name: `TEST rls B ${tenantB}` },
      ],
    });
    await prisma.customer.create({ data: customer(tenantA) });
    customerB = (await prisma.customer.create({ data: customer(tenantB) })).id;
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
    await prisma.onModuleDestroy();
  });

  const as = <T>(tenantId: string, fn: () => Promise<T>) =>
    TenantContext.run(tenantId, fn);
  const ours = () =>
    prisma.customer.findMany({
      where: { tenantId: { in: [tenantA, tenantB] } },
      select: { tenantId: true },
    });

  it('protects every table with tenant_id', async () => {
    expect(await unprotectedTenantTables(prisma['pool'])).toEqual([]);
  });

  it('shows each tenant only its rows, even if the query forgets the tenant', async () => {
    expect(await as(tenantA, () => ours())).toEqual([{ tenantId: tenantA }]);
    expect(await as(tenantB, () => ours())).toEqual([{ tenantId: tenantB }]);
  });

  it('shows nothing without a tenant', async () => {
    const rows = await TenantContext.runRequest(async () => await ours());
    expect(rows).toEqual([]);
  });

  it('refuses to write a row for another tenant', async () => {
    await expect(
      as(tenantA, () => prisma.customer.create({ data: customer(tenantB) })),
    ).rejects.toThrow(/row-level security/);
  });

  it('cannot touch another tenant’s row by id', async () => {
    const { count } = await as(tenantA, () =>
      prisma.customer.updateMany({
        where: { id: customerB },
        data: { firstName: 'Cambiado' },
      }),
    );
    expect(count).toBe(0);
    const deleted = await as(tenantA, () =>
      prisma.customer.deleteMany({ where: { id: customerB } }),
    );
    expect(deleted.count).toBe(0);
  });

  it('keeps the tenant inside an interactive transaction', async () => {
    const rows = await as(tenantB, () =>
      prisma.$transaction((tx) =>
        tx.customer.findMany({
          where: { tenantId: { in: [tenantA, tenantB] } },
          select: { tenantId: true },
        }),
      ),
    );
    expect(rows).toEqual([{ tenantId: tenantB }]);
  });

  it('lets the platform mode see every tenant', async () => {
    const rows = await TenantContext.runAsPlatform(() => ours());
    expect(rows.map((r) => r.tenantId).sort()).toEqual(
      [tenantA, tenantB].sort(),
    );
  });
});
