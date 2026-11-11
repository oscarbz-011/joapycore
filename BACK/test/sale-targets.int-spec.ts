/**
 * Integración contra PostgreSQL real del avance de metas: qué ventas suman al
 * vendedor según su estado y que no se mezclen empresas.
 *
 * Correr con: pnpm test:int
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { SaleOrderStatus, SaleType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { SaleTargetsRepository } from '../src/modules/sales/repositories/sale-targets.repository';
import { SaleTargetsService } from '../src/modules/sales/services/sale-targets.service';

const PERIOD = '2099-03';
const ORDER_DATE = new Date('2099-03-15T12:00:00Z');

describe('SaleTargetsService (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: SaleTargetsService;
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const seller = randomUUID();
  const foreignSeller = randomUUID();
  const customerA = randomUUID();
  const customerB = randomUUID();

  const order = (
    tenantId: string,
    customerId: string,
    sellerId: string,
    status: SaleOrderStatus,
    amount: number,
    saleType: SaleType = 'CASH',
  ) =>
    prisma.saleOrder.create({
      data: {
        tenantId,
        customerId,
        sellerId,
        status,
        saleType,
        orderDate: ORDER_DATE,
        items: {
          create: {
            description: 'Línea de prueba',
            quantity: 1,
            unitPrice: amount,
          },
        },
      },
    });

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    service = new SaleTargetsService(new SaleTargetsRepository(prisma));

    await prisma.tenant.createMany({
      data: [
        { id: tenantA, name: `TEST metas A ${tenantA}` },
        { id: tenantB, name: `TEST metas B ${tenantB}` },
      ],
    });
    const user = (id: string, tenantId: string) => ({
      id,
      tenantId,
      email: `${id}@example.test`,
      passwordHash: 'unused-test-only',
      firstName: 'Vendedor',
      lastName: 'Prueba',
    });
    await prisma.user.createMany({
      data: [user(seller, tenantA), user(foreignSeller, tenantB)],
    });
    await prisma.customer.createMany({
      data: [
        {
          id: customerA,
          tenantId: tenantA,
          firstName: 'Cliente',
          lastName: 'A',
        },
        {
          id: customerB,
          tenantId: tenantB,
          firstName: 'Cliente',
          lastName: 'B',
        },
      ],
    });

    await order(tenantA, customerA, seller, 'PAYMENT_RECEIVED', 100);
    await order(tenantA, customerA, seller, 'DELIVERED', 200);
    await order(tenantA, customerA, seller, 'CONFIRMED', 400, 'CREDIT');
    await order(tenantA, customerA, seller, 'INVOICED', 800, 'CREDIT');
    await order(tenantA, customerA, seller, 'PENDING', 1_000);
    await order(tenantA, customerA, seller, 'QUOTED', 2_000);
    await order(tenantA, customerA, seller, 'CANCELLED', 4_000);
    await order(
      tenantA,
      customerA,
      seller,
      'PENDING_CREDIT_APPROVAL',
      8_000,
      'CREDIT',
    );
    await order(tenantB, customerB, foreignSeller, 'DELIVERED', 16_000);
  });

  afterAll(async () => {
    if (!prisma) return;
    const tenants = { tenantId: { in: [tenantA, tenantB] } };
    await prisma.saleOrderItem.deleteMany({ where: { saleOrder: tenants } });
    await prisma.saleOrder.deleteMany({ where: tenants });
    await prisma.customer.deleteMany({ where: tenants });
    await prisma.user.deleteMany({ where: tenants });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantA, tenantB] } },
    });
    await prisma.$disconnect();
  });

  it('counts paid, delivered, confirmed and invoiced sales, and nothing else', async () => {
    const result = await service.getPerformance(tenantA, PERIOD, seller, true);

    expect(result.companyActual).toBe(1_500);
    expect(result.sellers).toEqual([
      expect.objectContaining({
        seller: expect.objectContaining({ id: seller }),
        actual: 1_500,
        cashAmount: 300,
        cashCount: 2,
        creditAmount: 1_200,
        creditCount: 2,
      }),
    ]);
  });

  it('does not count sales from another company', async () => {
    const result = await service.getPerformance(
      tenantB,
      PERIOD,
      foreignSeller,
      true,
    );

    expect(result.companyActual).toBe(16_000);
    expect(result.sellers.map((s) => s.seller.id)).toEqual([foreignSeller]);
  });
});
