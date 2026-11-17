import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { TenantContext } from '../src/prisma/tenant-context';
import { TENANT_SETTING, TenantPool } from '../src/prisma/tenant-pool';

// Con una sola conexión, cada consulta reutiliza la que dejó la anterior: si
// la empresa no se fijara al entregarla, se vería la de otro.
describe('TenantPool', () => {
  const pool = new TenantPool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  afterAll(() => prisma.$disconnect());

  const currentTenant = async () => {
    const [row] = await prisma.$queryRaw<{ tenant: string | null }[]>`
      SELECT current_setting(${TENANT_SETTING}, true) AS tenant`;
    return row.tenant;
  };

  it('sends the tenant of the context with each query', async () => {
    expect(await TenantContext.run('t1', currentTenant)).toBe('t1');
    expect(await TenantContext.run('t2', currentTenant)).toBe('t2');
  });

  it('clears it for a query without a tenant', async () => {
    await TenantContext.run('t1', currentTenant);
    expect(await currentTenant()).toBe('');
  });

  it('sends it inside an interactive transaction', async () => {
    const seen = await TenantContext.run('t1', () =>
      prisma.$transaction(async (tx) => {
        const [row] = await tx.$queryRaw<{ tenant: string }[]>`
          SELECT current_setting(${TENANT_SETTING}, true) AS tenant`;
        return row.tenant;
      }),
    );
    expect(seen).toBe('t1');
  });

  it('keeps concurrent tenants apart while they wait for the connection', async () => {
    const tenants = Array.from({ length: 30 }, (_, i) => `t${i % 3}`);
    const seen = await Promise.all(
      tenants.map((tenantId) => TenantContext.run(tenantId, currentTenant)),
    );
    expect(seen).toEqual(tenants);
  });
});
