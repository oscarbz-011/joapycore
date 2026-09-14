import { FinanceSourcesRepository } from '../repositories/finance-sources.repository';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';
import { FinanceOnArPaidListener } from './finance-on-ar-paid.listener';

const TENANT = 'tenant-1';
const event = { tenantId: TENANT, arId: 'ar-1', invoiceId: 'inv-1' };

describe('FinanceOnArPaidListener', () => {
  let tx: {
    installment: { findMany: jest.Mock; update: jest.Mock };
    loan: { update: jest.Mock };
  };
  let prisma: {
    invoice: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let listener: FinanceOnArPaidListener;

  beforeEach(() => {
    tx = {
      installment: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
      loan: { update: jest.fn().mockResolvedValue({}) },
    };
    prisma = {
      invoice: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ saleOrder: { loan: { id: 'loan-1' } } }),
      },
      $transaction: jest.fn((cb: (t: unknown) => unknown) => cb(tx)),
    };
    // Repositorios reales sobre los mocks de Prisma/tx.
    listener = new FinanceOnArPaidListener(
      prisma as any,
      new FinanceSourcesRepository(prisma as any),
      new LoansRepository(prisma as any),
      new InstallmentsRepository(prisma as any),
    );
  });

  it('busca la factura dentro del tenant del evento', async () => {
    await listener.handle(event);

    expect(prisma.invoice.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'inv-1', tenantId: TENANT } }),
    );
  });

  it('no hace nada si la factura no tiene préstamo (venta contado)', async () => {
    prisma.invoice.findFirst.mockResolvedValue({ saleOrder: { loan: null } });

    await listener.handle(event);

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('salda las cuotas pendientes y cierra el préstamo', async () => {
    tx.installment.findMany.mockResolvedValue([
      { id: 'inst-1', amount: 500_000 },
      { id: 'inst-2', amount: { toNumber: () => 450_000 } },
    ]);

    await listener.handle(event);

    expect(tx.installment.findMany).toHaveBeenCalledWith({
      where: { loanId: 'loan-1', tenantId: TENANT, status: { not: 'PAID' } },
    });
    expect(tx.installment.update).toHaveBeenCalledWith({
      where: { id: 'inst-1' },
      data: expect.objectContaining({ paidAmount: 500_000, status: 'PAID' }),
    });
    expect(tx.installment.update).toHaveBeenCalledWith({
      where: { id: 'inst-2' },
      data: expect.objectContaining({ paidAmount: 450_000, status: 'PAID' }),
    });
    expect(tx.loan.update).toHaveBeenCalledWith({
      where: { id: 'loan-1' },
      data: { status: 'PAID' },
    });
  });

  it('no toca el préstamo si no quedan cuotas pendientes', async () => {
    await listener.handle(event);

    expect(tx.loan.update).not.toHaveBeenCalled();
  });
});
