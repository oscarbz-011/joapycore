import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { randomUUID } from 'node:crypto';
import { EventBus } from '../src/common/events/event-bus';
import { FinanceSourcesRepository } from '../src/modules/finance/repositories/finance-sources.repository';
import { InstallmentsRepository } from '../src/modules/finance/repositories/installments.repository';
import { LoansRepository } from '../src/modules/finance/repositories/loans.repository';
import { PaymentReceiptsRepository } from '../src/modules/finance/repositories/payment-receipts.repository';
import { LoansService } from '../src/modules/finance/services/loans.service';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Cobro de cuotas de varias ventas de un cliente (PostgreSQL)', () => {
  let prisma: PrismaService;
  let service: LoansService;
  let tenantId: string;
  let customerId: string;
  let otherCustomerId: string;

  beforeAll(async () => {
    prisma = new PrismaService(new ConfigService(process.env));
    await prisma.$connect();
    service = new LoansService(
      prisma,
      new LoansRepository(prisma),
      new InstallmentsRepository(prisma),
      new EventBus(new EventEmitter2()),
      new PaymentReceiptsRepository(prisma),
      new FinanceSourcesRepository(prisma),
    );
    tenantId = (
      await prisma.tenant.create({
        data: { name: `TEST cobro cliente ${randomUUID()}` },
        select: { id: true },
      })
    ).id;
    [customerId, otherCustomerId] = await Promise.all(
      ['Alberto', 'Hernán'].map(
        async (firstName) =>
          (
            await prisma.customer.create({
              data: { tenantId, firstName, lastName: 'Prueba' },
              select: { id: true },
            })
          ).id,
      ),
    );
  });

  const removeSales = async () => {
    const where = { tenantId };
    await prisma.paymentReceiptItem.deleteMany({ where });
    await prisma.paymentReceipt.deleteMany({ where });
    await prisma.installment.deleteMany({ where });
    await prisma.loan.deleteMany({ where });
    await prisma.saleOrder.deleteMany({ where });
  };

  afterEach(removeSales);

  afterAll(async () => {
    if (!prisma) return;
    await removeSales();
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
    await prisma.$disconnect();
  });

  /** Venta a crédito con sus cuotas de 100.000, la primera ya vencida. */
  async function creditSale(customer: string, installments: number) {
    const order = await prisma.saleOrder.create({
      data: {
        tenantId,
        customerId: customer,
        saleType: 'CREDIT',
        status: 'INVOICED',
        orderDate: new Date('2026-09-01T12:00:00.000Z'),
        total: installments * 100_000,
      },
      select: { id: true },
    });
    const loan = await prisma.loan.create({
      data: {
        tenantId,
        saleOrderId: order.id,
        customerId: customer,
        principal: installments * 100_000,
        interestRate: 0,
        totalAmount: installments * 100_000,
        totalInstallments: installments,
        installments: {
          create: Array.from({ length: installments }, (_, i) => ({
            tenantId,
            number: i + 1,
            dueDate: new Date(Date.UTC(2026, 9 + i, 5)),
            amount: 100_000,
            status: i === 0 ? ('OVERDUE' as const) : ('PENDING' as const),
          })),
        },
      },
      include: { installments: { orderBy: { number: 'asc' } } },
    });
    return loan;
  }

  it('lists the active sales of the customer, oldest first', async () => {
    const first = await creditSale(customerId, 2);
    const second = await creditSale(customerId, 3);
    await creditSale(otherCustomerId, 1);

    const loans = await service.findActiveByCustomer(tenantId, customerId);

    expect(loans.map((loan) => loan.id)).toEqual([first.id, second.id]);
    expect(loans[1].installments).toHaveLength(3);
  });

  it('collects installments of two sales in one receipt and closes the sale it pays off', async () => {
    const first = await creditSale(customerId, 1);
    const second = await creditSale(customerId, 3);

    const { receipts } = await service.payCustomerInstallments(
      tenantId,
      customerId,
      {
        items: [
          { installmentId: first.installments[0].id, amount: 100_000 },
          { installmentId: second.installments[0].id, amount: 40_000 },
        ],
        paymentMethod: 'CASH',
      },
    );

    expect(receipts).toHaveLength(1);
    expect(receipts[0].loan).toBeNull();
    expect(Number(receipts[0].totalAmount)).toBe(140_000);
    expect(receipts[0].items.map((item) => item.installmentId).sort()).toEqual(
      [first.installments[0].id, second.installments[0].id].sort(),
    );
    const [paidLoan, openLoan] = await Promise.all(
      [first.id, second.id].map((id) =>
        prisma.loan.findUniqueOrThrow({
          where: { id },
          include: { installments: { orderBy: { number: 'asc' } } },
        }),
      ),
    );
    expect(paidLoan.status).toBe('PAID');
    expect(openLoan.status).toBe('ACTIVE');
    expect(openLoan.installments[0]).toMatchObject({ status: 'PARTIAL' });
    expect(Number(openLoan.installments[0].paidAmount)).toBe(40_000);
  });

  it('issues one numbered receipt per sale when asked', async () => {
    const first = await creditSale(customerId, 2);
    const second = await creditSale(customerId, 2);

    const { receipts } = await service.payCustomerInstallments(
      tenantId,
      customerId,
      {
        items: [
          { installmentId: first.installments[0].id, amount: 100_000 },
          { installmentId: second.installments[0].id, amount: 100_000 },
        ],
        paymentMethod: 'CASH',
        separateReceipts: true,
      },
    );

    expect(receipts.map((receipt) => receipt.loan?.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect(new Set(receipts.map((r) => r.receiptNumber)).size).toBe(2);
  });

  it('refuses an installment of another customer and leaves everything untouched', async () => {
    const mine = await creditSale(customerId, 1);
    const theirs = await creditSale(otherCustomerId, 1);

    await expect(
      service.payCustomerInstallments(tenantId, customerId, {
        items: [
          { installmentId: mine.installments[0].id, amount: 100_000 },
          { installmentId: theirs.installments[0].id, amount: 100_000 },
        ],
        paymentMethod: 'CASH',
      }),
    ).rejects.toThrow('no es una cuota pendiente de este cliente');

    const untouched = await prisma.installment.findUniqueOrThrow({
      where: { id: mine.installments[0].id },
    });
    expect(Number(untouched.paidAmount)).toBe(0);
    expect(await prisma.paymentReceipt.count({ where: { tenantId } })).toBe(0);
  });
});
