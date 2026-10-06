import { CreditEvaluationService } from './credit-evaluation.service';
import { CreditSourcesRepository } from '../repositories/credit-sources.repository';

function makeLoan(overrides = {}) {
  return {
    id: 'loan-1',
    status: 'ACTIVE',
    totalAmount: 900_000,
    totalInstallments: 9,
    createdAt: new Date('2026-01-16'),
    installments: [],
    saleOrder: {
      items: [{ product: { name: 'Heladera' }, description: null }],
      invoice: { id: 'inv-1', invoiceNumber: '001-001-0000123' },
    },
    ...overrides,
  };
}

function makeInstallment(overrides = {}) {
  return {
    number: 1,
    status: 'PENDING',
    amount: 100_000,
    paidAmount: 0,
    paidAt: null,
    dueDate: new Date('2026-09-01'),
    ...overrides,
  };
}

describe('CreditEvaluationService', () => {
  let service: CreditEvaluationService;
  let prisma: {
    loan: { findMany: jest.Mock; findFirst: jest.Mock };
    customer: { findFirst: jest.Mock };
    creditConfig: { findUnique: jest.Mock };
    creditBureauConfig: { findUnique: jest.Mock };
    creditBureauCheck: { findFirst: jest.Mock };
  };

  beforeEach(() => {
    prisma = {
      loan: { findMany: jest.fn(), findFirst: jest.fn() },
      customer: { findFirst: jest.fn() },
      creditConfig: { findUnique: jest.fn() },
      creditBureauConfig: { findUnique: jest.fn() },
      creditBureauCheck: { findFirst: jest.fn() },
    };
    service = new CreditEvaluationService(
      new CreditSourcesRepository(prisma as never),
    );
  });

  // ── getCustomerCreditHistory ─────────────────────────────────────────────

  describe('getCustomerCreditHistory', () => {
    const today = new Date('2026-10-01T12:00:00Z');
    const history = () =>
      service.getCustomerCreditHistory('tenant-1', 'cust-1', today);
    const paid = (dueDate: string, paidAt: string, overrides = {}) =>
      makeInstallment({
        status: 'PAID',
        paidAmount: 100_000,
        dueDate: new Date(dueDate),
        paidAt: new Date(paidAt),
        ...overrides,
      });

    it('has no score when the customer never had a loan', async () => {
      prisma.loan.findMany.mockResolvedValue([]);

      const result = await history();

      expect(result.score).toBeNull();
      expect(result.averageDelayDays).toBeNull();
      expect(result.activeLoans).toEqual([]);
      expect(result.finishedLoans).toEqual([]);
    });

    it('has no score while no installment is due or paid yet', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          installments: [makeInstallment({ dueDate: new Date('2026-11-05') })],
        }),
      ]);

      const result = await history();

      expect(result.score).toBeNull();
      expect(result.activeLoans).toHaveLength(1);
    });

    it('rates 1 when every installment was paid on time', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({ installments: [paid('2026-09-05', '2026-09-03')] }),
      ]);

      const result = await history();

      expect(result.score).toBe(1);
      expect(result.averageDelayDays).toBe(0);
      expect(result.overdueCount).toBe(0);
    });

    it('rates by the average delay over every evaluable installment of every loan', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          id: 'loan-a',
          installments: [
            paid('2026-08-05', '2026-08-05', { number: 1 }),
            paid('2026-09-05', '2026-09-25', { number: 2 }),
            makeInstallment({ number: 3, dueDate: new Date('2026-10-05') }),
          ],
        }),
        makeLoan({
          id: 'loan-b',
          status: 'PAID',
          installments: [paid('2026-05-05', '2026-05-15')],
        }),
      ]);

      const result = await history();

      // (0 + 20 + 10) / 3 = 10 días → nivel 3 con los rangos por defecto.
      expect(result.averageDelayDays).toBe(10);
      expect(result.score).toBe(3);
      expect(result.activeLoans[0]).toMatchObject({
        loanId: 'loan-a',
        averageDelayDays: 10,
        maxDelayDays: 20,
        lateInstallments: 1,
      });
      expect(result.finishedLoans[0]).toMatchObject({
        loanId: 'loan-b',
        averageDelayDays: 10,
      });
    });

    it('counts an unpaid overdue installment up to today', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          installments: [
            makeInstallment({
              status: 'OVERDUE',
              dueDate: new Date('2026-09-21'),
              paidAmount: 40_000,
            }),
          ],
        }),
      ]);

      const result = await history();

      expect(result.averageDelayDays).toBe(10);
      expect(result.overdueCount).toBe(1);
      expect(result.overdueAmount).toBe(60_000);
    });

    it('uses the delay ranges configured by the tenant', async () => {
      prisma.creditConfig.findUnique.mockResolvedValue({
        ratingDelayThresholds: [2, 4, 6, 8],
        uncollectibleAfterDays: null,
      });
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({ installments: [paid('2026-09-05', '2026-09-12')] }),
      ]);

      await expect(history()).resolves.toMatchObject({
        averageDelayDays: 7,
        score: 4,
      });
      expect(prisma.creditConfig.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
      );
    });

    it('rates 6 when the customer is manually marked as uncollectible, even without loans', async () => {
      prisma.loan.findMany.mockResolvedValue([]);
      prisma.customer.findFirst.mockResolvedValue({
        uncollectibleAt: new Date('2026-09-30'),
        uncollectibleReason: 'En gestión judicial',
      });

      const result = await history();

      expect(result.score).toBe(6);
      expect(result.uncollectible).toEqual({
        manual: {
          markedAt: new Date('2026-09-30'),
          reason: 'En gestión judicial',
        },
        automatic: false,
      });
      expect(prisma.customer.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cust-1', tenantId: 'tenant-1' },
        }),
      );
    });

    it('rates 6 automatically while an unpaid installment exceeds the configured days', async () => {
      prisma.creditConfig.findUnique.mockResolvedValue({
        ratingDelayThresholds: [0, 5, 15, 30],
        uncollectibleAfterDays: 90,
      });
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          installments: [
            makeInstallment({
              status: 'OVERDUE',
              dueDate: new Date('2026-06-01'),
            }),
          ],
        }),
      ]);

      const result = await history();

      expect(result.score).toBe(6);
      expect(result.uncollectible).toEqual({ manual: null, automatic: true });
    });

    it('leaves level 6 once the long overdue installment is paid', async () => {
      prisma.creditConfig.findUnique.mockResolvedValue({
        ratingDelayThresholds: [0, 5, 15, 30],
        uncollectibleAfterDays: 90,
      });
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({ installments: [paid('2026-06-01', '2026-09-30')] }),
      ]);

      const result = await history();

      expect(result.uncollectible.automatic).toBe(false);
      expect(result.score).toBe(5);
    });

    it('never rates 6 automatically when the tenant did not configure the days', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          installments: [
            makeInstallment({
              status: 'OVERDUE',
              dueDate: new Date('2025-01-01'),
            }),
          ],
        }),
      ]);

      await expect(history()).resolves.toMatchObject({ score: 5 });
    });

    it('separates active from finished loans and ignores cancelled ones', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({ id: 'active' }),
        makeLoan({
          id: 'finished',
          status: 'PAID',
          installments: [paid('2026-09-05', '2026-09-05')],
        }),
        makeLoan({
          id: 'cancelled',
          status: 'CANCELLED',
          installments: [
            makeInstallment({
              status: 'OVERDUE',
              dueDate: new Date('2026-01-01'),
            }),
          ],
        }),
      ]);

      const result = await history();

      expect(result.activeLoans.map((loan) => loan.loanId)).toEqual(['active']);
      expect(result.finishedLoans.map((loan) => loan.loanId)).toEqual([
        'finished',
      ]);
      expect(result.overdueCount).toBe(0);
      expect(result.score).toBe(1);
    });

    it('ties each loan to its invoice and details every installment', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          totalAmount: 200_000,
          totalInstallments: 2,
          installments: [
            paid('2026-08-05', '2026-08-08', { number: 1 }),
            makeInstallment({
              number: 2,
              status: 'PARTIAL',
              paidAmount: 30_000,
              dueDate: new Date('2026-11-05'),
            }),
          ],
        }),
      ]);

      const [loan] = (await history()).activeLoans;

      expect(loan).toMatchObject({
        invoiceId: 'inv-1',
        invoiceNumber: '001-001-0000123',
        productNames: ['Heladera'],
        totalAmount: 200_000,
        paidAmount: 130_000,
        outstandingBalance: 70_000,
      });
      expect(loan.installments).toEqual([
        {
          number: 1,
          dueDate: new Date('2026-08-05'),
          amount: 100_000,
          paidAmount: 100_000,
          balance: 0,
          paidAt: new Date('2026-08-08'),
          status: 'PAID',
          delayDays: 3,
        },
        {
          number: 2,
          dueDate: new Date('2026-11-05'),
          amount: 100_000,
          paidAmount: 30_000,
          balance: 70_000,
          paidAt: null,
          status: 'PARTIAL',
          delayDays: null,
        },
      ]);
    });

    it('has no invoice when the sale was not invoiced yet', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          saleOrder: {
            items: [{ product: null, description: 'Servicio' }],
            invoice: null,
          },
        }),
      ]);

      const [loan] = (await history()).activeLoans;

      expect(loan).toMatchObject({
        invoiceId: null,
        invoiceNumber: null,
        productNames: ['Servicio'],
      });
    });

    it('reports installments paid, total installments, start date and due date range', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          totalAmount: 600_000,
          totalInstallments: 6,
          createdAt: new Date('2026-01-16'),
          installments: [
            paid('2026-02-16', '2026-02-16', { number: 1 }),
            paid('2026-03-16', '2026-03-16', { number: 2 }),
            makeInstallment({ number: 3, dueDate: new Date('2026-11-16') }),
            makeInstallment({ number: 4, dueDate: new Date('2026-12-16') }),
            makeInstallment({ number: 5, dueDate: new Date('2027-01-16') }),
            makeInstallment({ number: 6, dueDate: new Date('2027-02-16') }),
          ],
        }),
      ]);

      const [loan] = (await history()).activeLoans;

      expect(loan.installmentsPaid).toBe(2);
      expect(loan.totalInstallments).toBe(6);
      expect(loan.monthlyInstallment).toBe(100_000);
      expect(loan.startDate).toEqual(new Date('2026-01-16'));
      expect(loan.firstDueDate).toEqual(new Date('2026-02-16'));
      expect(loan.finalDueDate).toEqual(new Date('2027-02-16'));
      expect(loan.nextDueDate).toEqual(new Date('2026-11-16'));
    });
  });

  // ── evaluateIncomeCapacity ───────────────────────────────────────────────

  describe('evaluateIncomeCapacity', () => {
    it('is not applicable when the customer has no declared monthly income', async () => {
      prisma.customer.findFirst.mockResolvedValue({ monthlyIncome: null });
      prisma.creditConfig.findUnique.mockResolvedValue({
        maxIncomePercentage: 30,
      });

      const result = await service.evaluateIncomeCapacity(
        'tenant-1',
        'cust-1',
        500_000,
      );

      expect(result.applicable).toBe(false);
      expect(result.exceeds).toBe(false);
    });

    it('is not applicable when there is no configured max income percentage', async () => {
      prisma.customer.findFirst.mockResolvedValue({ monthlyIncome: 3_000_000 });
      prisma.creditConfig.findUnique.mockResolvedValue(null);

      const result = await service.evaluateIncomeCapacity(
        'tenant-1',
        'cust-1',
        500_000,
      );

      expect(result.applicable).toBe(false);
    });

    it('flags exceeds=true when the proposed payment plus current commitments passes the limit', async () => {
      prisma.customer.findFirst.mockResolvedValue({ monthlyIncome: 3_000_000 });
      prisma.creditConfig.findUnique.mockResolvedValue({
        maxIncomePercentage: 30,
      });
      prisma.loan.findMany.mockResolvedValue([
        { totalAmount: 5_400_000, totalInstallments: 9 },
      ]); // 600_000/mes

      // max permitido = 900_000; compromiso actual = 600_000; disponible = 300_000; propuesto = 400_000
      const result = await service.evaluateIncomeCapacity(
        'tenant-1',
        'cust-1',
        400_000,
      );

      expect(result.maxAllowed).toBe(900_000);
      expect(result.currentCommitment).toBe(600_000);
      expect(result.available).toBe(300_000);
      expect(result.exceeds).toBe(true);
    });

    it('flags exceeds=false when the proposed payment fits within the available capacity', async () => {
      prisma.customer.findFirst.mockResolvedValue({ monthlyIncome: 3_000_000 });
      prisma.creditConfig.findUnique.mockResolvedValue({
        maxIncomePercentage: 30,
      });
      prisma.loan.findMany.mockResolvedValue([]);

      const result = await service.evaluateIncomeCapacity(
        'tenant-1',
        'cust-1',
        500_000,
      );

      expect(result.available).toBe(900_000);
      expect(result.exceeds).toBe(false);
    });

    it('combines the customer income with declared guarantor income to compute maxAllowed', async () => {
      prisma.customer.findFirst.mockResolvedValue({ monthlyIncome: 3_000_000 });
      prisma.creditConfig.findUnique.mockResolvedValue({
        maxIncomePercentage: 30,
      });
      prisma.loan.findMany.mockResolvedValue([
        { totalAmount: 5_400_000, totalInstallments: 9 },
      ]); // 600_000/mes de compromiso actual

      // sin garante: max permitido 900_000, disponible 300_000 -> 400_000 excede
      // con garante de 2_000_000: ingreso combinado 5_000_000, max permitido
      // 1_500_000, disponible 900_000 -> 400_000 ya no excede
      const result = await service.evaluateIncomeCapacity(
        'tenant-1',
        'cust-1',
        400_000,
        [2_000_000],
      );

      expect(result.customerIncome).toBe(3_000_000);
      expect(result.guarantorIncome).toBe(2_000_000);
      expect(result.monthlyIncome).toBe(5_000_000);
      expect(result.maxAllowed).toBe(1_500_000);
      expect(result.available).toBe(900_000);
      expect(result.exceeds).toBe(false);
    });

    it('is applicable using only the guarantor income when the customer declared none', async () => {
      prisma.customer.findFirst.mockResolvedValue({ monthlyIncome: null });
      prisma.creditConfig.findUnique.mockResolvedValue({
        maxIncomePercentage: 30,
      });
      prisma.loan.findMany.mockResolvedValue([]);

      const result = await service.evaluateIncomeCapacity(
        'tenant-1',
        'cust-1',
        200_000,
        [1_000_000],
      );

      expect(result.applicable).toBe(true);
      expect(result.customerIncome).toBeNull();
      expect(result.guarantorIncome).toBe(1_000_000);
      expect(result.monthlyIncome).toBe(1_000_000);
      expect(result.maxAllowed).toBe(300_000);
    });
  });

  // ── getBureauCheckStatus ─────────────────────────────────────────────────

  describe('getBureauCheckStatus', () => {
    it('is never required when the bureau integration is disabled', async () => {
      prisma.creditBureauConfig.findUnique.mockResolvedValue({
        isEnabled: false,
      });

      const result = await service.getBureauCheckStatus(
        'tenant-1',
        'cust-1',
        'order-1',
      );

      expect(result).toEqual({ required: false, latestResult: null });
    });

    it('is never required when no config row exists for the tenant', async () => {
      prisma.creditBureauConfig.findUnique.mockResolvedValue(null);

      const result = await service.getBureauCheckStatus(
        'tenant-1',
        'cust-1',
        'order-1',
      );

      expect(result.required).toBe(false);
    });

    describe('EVERY_REQUEST frequency', () => {
      it('requires a check when none exists yet for this sale order', async () => {
        prisma.creditBureauConfig.findUnique.mockResolvedValue({
          isEnabled: true,
          checkFrequency: 'EVERY_REQUEST',
        });
        prisma.creditBureauCheck.findFirst.mockResolvedValue(null);

        const result = await service.getBureauCheckStatus(
          'tenant-1',
          'cust-1',
          'order-1',
        );

        expect(result).toEqual({ required: true, latestResult: null });
      });

      it('is not required and surfaces the latest result once a check exists for this order', async () => {
        prisma.creditBureauConfig.findUnique.mockResolvedValue({
          isEnabled: true,
          checkFrequency: 'EVERY_REQUEST',
        });
        prisma.creditBureauCheck.findFirst.mockResolvedValue({
          result: 'FLAGGED',
        });

        const result = await service.getBureauCheckStatus(
          'tenant-1',
          'cust-1',
          'order-1',
        );

        expect(result).toEqual({ required: false, latestResult: 'FLAGGED' });
      });
    });

    describe('FIRST_PURCHASE_ONLY frequency', () => {
      it('is not required when the customer already has a loan (previously vetted)', async () => {
        prisma.creditBureauConfig.findUnique.mockResolvedValue({
          isEnabled: true,
          checkFrequency: 'FIRST_PURCHASE_ONLY',
        });
        prisma.loan.findFirst.mockResolvedValue({ id: 'loan-1' });

        const result = await service.getBureauCheckStatus(
          'tenant-1',
          'cust-1',
          'order-1',
        );

        expect(result).toEqual({ required: false, latestResult: null });
      });

      it('requires a check for a customer with no prior loan and no prior check', async () => {
        prisma.creditBureauConfig.findUnique.mockResolvedValue({
          isEnabled: true,
          checkFrequency: 'FIRST_PURCHASE_ONLY',
        });
        prisma.loan.findFirst.mockResolvedValue(null);
        prisma.creditBureauCheck.findFirst.mockResolvedValue(null);

        const result = await service.getBureauCheckStatus(
          'tenant-1',
          'cust-1',
          'order-1',
        );

        expect(result).toEqual({ required: true, latestResult: null });
      });

      it('is not required once a first check was recorded even without a loan yet', async () => {
        prisma.creditBureauConfig.findUnique.mockResolvedValue({
          isEnabled: true,
          checkFrequency: 'FIRST_PURCHASE_ONLY',
        });
        prisma.loan.findFirst.mockResolvedValue(null);
        prisma.creditBureauCheck.findFirst.mockResolvedValue({
          result: 'CLEAN',
        });

        const result = await service.getBureauCheckStatus(
          'tenant-1',
          'cust-1',
          'order-1',
        );

        expect(result).toEqual({ required: false, latestResult: 'CLEAN' });
      });
    });
  });
});

// Note: prisma.loan.findMany is reused across getCustomerCreditHistory,
// evaluateIncomeCapacity and getBureauCheckStatus with different result
// shapes — each `it` sets its own mock so there's no cross-test bleed.
