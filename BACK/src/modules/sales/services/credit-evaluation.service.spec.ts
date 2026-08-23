import { CreditEvaluationService } from './credit-evaluation.service';

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
    moraAmount: 0,
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
    service = new CreditEvaluationService(prisma as never);
  });

  // ── getCustomerCreditHistory ─────────────────────────────────────────────

  describe('getCustomerCreditHistory', () => {
    it('rates SIN_HISTORIAL when the customer never had a loan', async () => {
      prisma.loan.findMany.mockResolvedValue([]);

      const result = await service.getCustomerCreditHistory(
        'tenant-1',
        'cust-1',
      );

      expect(result.rating).toBe('SIN_HISTORIAL');
      expect(result.activeLoans).toEqual([]);
    });

    it('rates BUENO when there is history and no installment was ever late', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          installments: [
            makeInstallment({ status: 'PAID', paidAmount: 100_000 }),
          ],
        }),
      ]);

      const result = await service.getCustomerCreditHistory(
        'tenant-1',
        'cust-1',
      );

      expect(result.rating).toBe('BUENO');
      expect(result.overdueCount).toBe(0);
    });

    it('rates REGULAR when nothing is overdue now but some installment had mora in the past', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          installments: [
            makeInstallment({
              status: 'PAID',
              paidAmount: 100_000,
              moraAmount: 1_500,
            }),
          ],
        }),
      ]);

      const result = await service.getCustomerCreditHistory(
        'tenant-1',
        'cust-1',
      );

      expect(result.rating).toBe('REGULAR');
    });

    it('rates RIESGO when there is at least one currently overdue installment', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          installments: [
            makeInstallment({
              status: 'OVERDUE',
              amount: 100_000,
              paidAmount: 0,
            }),
          ],
        }),
      ]);

      const result = await service.getCustomerCreditHistory(
        'tenant-1',
        'cust-1',
      );

      expect(result.rating).toBe('RIESGO');
      expect(result.overdueCount).toBe(1);
      expect(result.overdueAmount).toBe(100_000);
    });

    it('computes outstanding balance from totalAmount minus paid installments, not the original amount', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          totalAmount: 900_000,
          totalInstallments: 9,
          installments: [
            makeInstallment({ status: 'PAID', paidAmount: 800_000 }),
            makeInstallment({
              status: 'PENDING',
              amount: 100_000,
              paidAmount: 0,
            }),
          ],
        }),
      ]);

      const result = await service.getCustomerCreditHistory(
        'tenant-1',
        'cust-1',
      );

      expect(result.activeLoans[0].outstandingBalance).toBe(100_000);
    });

    it('reports installments paid, total installments, start date and final due date', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          totalAmount: 600_000,
          totalInstallments: 6,
          createdAt: new Date('2026-01-16'),
          installments: [
            makeInstallment({
              number: 1,
              status: 'PAID',
              paidAmount: 100_000,
              dueDate: new Date('2026-02-16'),
            }),
            makeInstallment({
              number: 2,
              status: 'PAID',
              paidAmount: 100_000,
              dueDate: new Date('2026-03-16'),
            }),
            makeInstallment({
              number: 3,
              status: 'PENDING',
              paidAmount: 0,
              dueDate: new Date('2026-04-16'),
            }),
            makeInstallment({
              number: 4,
              status: 'PENDING',
              paidAmount: 0,
              dueDate: new Date('2026-05-16'),
            }),
            makeInstallment({
              number: 5,
              status: 'PENDING',
              paidAmount: 0,
              dueDate: new Date('2026-06-16'),
            }),
            makeInstallment({
              number: 6,
              status: 'PENDING',
              paidAmount: 0,
              dueDate: new Date('2026-07-16'),
            }),
          ],
        }),
      ]);

      const result = await service.getCustomerCreditHistory(
        'tenant-1',
        'cust-1',
      );
      const loan = result.activeLoans[0];

      expect(loan.totalAmount).toBe(600_000);
      expect(loan.installmentsPaid).toBe(2);
      expect(loan.totalInstallments).toBe(6);
      expect(loan.startDate).toEqual(new Date('2026-01-16'));
      expect(loan.firstDueDate).toEqual(new Date('2026-02-16'));
      expect(loan.finalDueDate).toEqual(new Date('2026-07-16'));
      expect(loan.nextDueDate).toEqual(new Date('2026-04-16'));
    });

    it('excludes non-ACTIVE loans from activeLoans but still uses them for the rating', async () => {
      prisma.loan.findMany.mockResolvedValue([
        makeLoan({
          status: 'PAID',
          installments: [makeInstallment({ status: 'PAID', moraAmount: 500 })],
        }),
      ]);

      const result = await service.getCustomerCreditHistory(
        'tenant-1',
        'cust-1',
      );

      expect(result.activeLoans).toEqual([]);
      expect(result.rating).toBe('REGULAR');
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
