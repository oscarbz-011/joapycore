import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { CustomersRepository } from '../src/modules/sales/repositories/customers.repository';
import { CustomersService } from '../src/modules/sales/services/customers.service';

const url = process.env.COMMUNICATIONS_TEST_DATABASE_URL;
if (url && !/^\/joapycore_comms_test_[\w-]+$/.test(new URL(url).pathname)) {
  throw new Error(
    'COMMUNICATIONS_TEST_DATABASE_URL debe apuntar a una base aislada joapycore_comms_test_*',
  );
}
const integration = url ? describe : describe.skip;

integration('Customer birth date (isolated PostgreSQL)', () => {
  const tenantId = randomUUID();
  let prisma: PrismaService;
  let service: CustomersService;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService({ DATABASE_URL: url }));
    await prisma.$connect();
    await prisma.tenant.create({
      data: { id: tenantId, name: `TEST birth date ${tenantId}` },
    });
    service = new CustomersService(new CustomersRepository(prisma), {
      emit: () => undefined,
    } as never);
  });

  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.tenant.delete({ where: { id: tenantId } });
    await prisma.onModuleDestroy();
  });

  it('keeps the same day, then clears it', async () => {
    const created = await service.create(tenantId, {
      firstName: 'María',
      lastName: 'González',
      birthDate: '1990-05-20',
    });

    const stored = await prisma.customer.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(stored.birthDate?.toISOString()).toBe('1990-05-20T00:00:00.000Z');

    await service.update(tenantId, created.id, { birthDate: null });
    const cleared = await prisma.customer.findUniqueOrThrow({
      where: { id: created.id },
    });
    expect(cleared.birthDate).toBeNull();
  });
});
