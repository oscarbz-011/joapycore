import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceSourcesRepository } from '../repositories/finance-sources.repository';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';
import { InstallmentsSchedulerService } from './installments-scheduler.service';
import { InterestCalcService } from './interest-calc.service';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TENANT = 'tenant-1';

describe('InstallmentsRepository loan refresh scope', () => {
  it('marks and selects overdue installments only for the requested tenant and loan', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new InstallmentsRepository({
      installment: { updateMany, findMany },
    } as never);

    await repository.markLoanOverdue(
      TENANT,
      'loan-1',
      new Date('2026-08-18T12:00:00Z'),
    );
    await repository.findAllOverdueForMora({
      tenantId: TENANT,
      loanId: 'loan-1',
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: TENANT,
        loanId: 'loan-1',
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: new Date('2026-08-18T00:00:00Z') },
      },
      data: { status: 'OVERDUE' },
    });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT,
          loanId: 'loan-1',
          status: 'OVERDUE',
        },
      }),
    );
  });

  it('clears only open charges belonging to disabled components on selected installments', async () => {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const repository = new InstallmentsRepository({
      installmentInterestCharge: { updateMany },
    } as never);

    await repository.clearInactiveInterestCharges(['inst-1']);

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        installmentId: { in: ['inst-1'] },
        amount: { gt: 0 },
        component: { is: { isActive: false } },
      },
      data: { amount: 0 },
    });
  });
});

describe('InstallmentsSchedulerService', () => {
  let service: InstallmentsSchedulerService;
  let installmentsRepo: {
    markAllOverdue: jest.Mock;
    markLoanOverdue: jest.Mock;
    findAllOverdueForMora: jest.Mock;
    upsertInterestCharge: jest.Mock;
    clearInactiveInterestCharges: jest.Mock;
  };
  let prisma: {
    creditConfig: { findMany: jest.Mock };
    loan: { findMany: jest.Mock };
    delinquencyReport: { findUnique: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    const mockInstallmentsRepo = {
      markAllOverdue: jest.fn(),
      markLoanOverdue: jest.fn(),
      findAllOverdueForMora: jest.fn(),
      upsertInterestCharge: jest.fn().mockResolvedValue({}),
      clearInactiveInterestCharges: jest.fn().mockResolvedValue({ count: 0 }),
    };
    const mockPrisma = {
      creditConfig: { findMany: jest.fn() },
      loan: { findMany: jest.fn() },
      delinquencyReport: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstallmentsSchedulerService,
        InterestCalcService,
        { provide: InstallmentsRepository, useValue: mockInstallmentsRepo },
        { provide: PrismaService, useValue: mockPrisma },
        FinanceSourcesRepository,
        LoansRepository,
      ],
    }).compile();

    service = module.get(InstallmentsSchedulerService);
    installmentsRepo = module.get(InstallmentsRepository);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('recalculateInterestCharges', () => {
    it('removes an open charge when its component is disabled', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);
      let openCharge = 0;
      let componentActive = true;
      installmentsRepo.clearInactiveInterestCharges.mockImplementation(() => {
        if (!componentActive) openCharge = 0;
        return Promise.resolve({ count: componentActive ? 0 : 1 });
      });
      installmentsRepo.upsertInterestCharge.mockImplementation(
        (_installmentId, _componentId, amount) => {
          openCharge = amount;
          return Promise.resolve({} as never);
        },
      );
      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 100_000,
          dueDate: new Date(now.getTime() - MS_PER_DAY),
        },
      ] as never);
      prisma.creditConfig.findMany
        .mockResolvedValueOnce([
          {
            tenantId: TENANT,
            moraGraceDays: 0,
            interestComponents: [
              {
                id: 'monthly-fee',
                frequency: 'MONTHLY',
                percentage: 10,
                cumulative: false,
              },
            ],
          },
        ])
        .mockResolvedValueOnce([
          {
            tenantId: TENANT,
            moraGraceDays: 0,
            interestComponents: [],
          },
        ]);

      await service.refreshLoanCharges(TENANT, 'loan-1');
      expect(openCharge).toBe(10_000);

      componentActive = false;
      await service.refreshLoanCharges(TENANT, 'loan-1');
      expect(openCharge).toBe(0);
    });

    it('clears an open charge when the grace period is extended past the overdue day', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);
      let openCharge = 0;
      installmentsRepo.upsertInterestCharge.mockImplementation(
        (_installmentId, _componentId, amount) => {
          openCharge = amount;
          return Promise.resolve({} as never);
        },
      );
      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 100_000,
          dueDate: new Date(now.getTime() - MS_PER_DAY),
        },
      ] as never);
      const component = {
        id: 'monthly-fee',
        frequency: 'MONTHLY',
        percentage: 10,
        cumulative: false,
      };
      prisma.creditConfig.findMany
        .mockResolvedValueOnce([
          {
            tenantId: TENANT,
            moraGraceDays: 0,
            interestComponents: [component],
          },
        ])
        .mockResolvedValueOnce([
          {
            tenantId: TENANT,
            moraGraceDays: 5,
            interestComponents: [component],
          },
        ]);

      await service.refreshLoanCharges(TENANT, 'loan-1');
      expect(openCharge).toBe(10_000);

      await service.refreshLoanCharges(TENANT, 'loan-1');
      expect(openCharge).toBe(0);
    });

    it('refreshes one loan on demand before it is displayed or collected', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);
      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 100000,
          dueDate: new Date(now.getTime() - 3 * MS_PER_DAY),
        },
      ] as never);
      prisma.creditConfig.findMany.mockResolvedValue([
        {
          tenantId: TENANT,
          moraGraceDays: 0,
          interestComponents: [
            {
              id: 'daily-mora',
              frequency: 'DAILY',
              percentage: 1,
              cumulative: false,
            },
          ],
        },
      ]);

      await service.refreshLoanCharges(TENANT, 'loan-1');

      expect(installmentsRepo.markLoanOverdue).toHaveBeenCalledWith(
        TENANT,
        'loan-1',
      );
      expect(installmentsRepo.findAllOverdueForMora).toHaveBeenCalledWith({
        tenantId: TENANT,
        loanId: 'loan-1',
      });
      expect(installmentsRepo.upsertInterestCharge).toHaveBeenCalledWith(
        'inst-1',
        'daily-mora',
        3000,
        1,
      );
    });

    it('stores no open charge while the installment is still within the tolerance window', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 100000,
          dueDate: new Date(now.getTime() - 2 * MS_PER_DAY),
        },
      ] as never);
      prisma.creditConfig.findMany.mockResolvedValue([
        {
          tenantId: TENANT,
          moraGraceDays: 5,
          interestComponents: [
            {
              id: 'comp-1',
              frequency: 'DAILY',
              percentage: 1,
              cumulative: false,
            },
          ],
        },
      ]);

      await service.recalculateInterestCharges();

      expect(installmentsRepo.upsertInterestCharge).toHaveBeenCalledWith(
        'inst-1',
        'comp-1',
        0,
        0,
      );
    });

    it('charges a DAILY component only for the days elapsed after the tolerance window ends', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      // Vencida hace 10 días, tolerancia de 5 -> solo devenga por 5 días.
      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 100000,
          dueDate: new Date(now.getTime() - 10 * MS_PER_DAY),
        },
      ] as never);
      prisma.creditConfig.findMany.mockResolvedValue([
        {
          tenantId: TENANT,
          moraGraceDays: 5,
          interestComponents: [
            {
              id: 'comp-1',
              frequency: 'DAILY',
              percentage: 1,
              cumulative: false,
            },
          ],
        },
      ]);

      await service.recalculateInterestCharges();

      // 1% diario de 100000 = 1000/día * 5 días = 5000
      expect(installmentsRepo.upsertInterestCharge).toHaveBeenCalledWith(
        'inst-1',
        'comp-1',
        5000,
        1,
      );
    });

    it('skips installments when the tenant has no active interest components', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 100000,
          dueDate: new Date(now.getTime() - 30 * MS_PER_DAY),
        },
      ] as never);
      prisma.creditConfig.findMany.mockResolvedValue([
        { tenantId: TENANT, moraGraceDays: 0, interestComponents: [] },
      ]);

      await service.recalculateInterestCharges();

      expect(installmentsRepo.upsertInterestCharge).not.toHaveBeenCalled();
    });

    it('sums multiple simultaneous components (admin fee ONE_TIME + MONTHLY cumulative mora)', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      // Vencida hace 95 días, sin tolerancia -> cuarto período de 30 días iniciado.
      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 1_000_000,
          dueDate: new Date(now.getTime() - 95 * MS_PER_DAY),
        },
      ] as never);
      prisma.creditConfig.findMany.mockResolvedValue([
        {
          tenantId: TENANT,
          moraGraceDays: 0,
          interestComponents: [
            {
              id: 'admin-fee',
              frequency: 'ONE_TIME',
              percentage: 5,
              cumulative: false,
            },
            {
              id: 'mora',
              frequency: 'MONTHLY',
              percentage: 10,
              cumulative: true,
            },
          ],
        },
      ]);

      await service.recalculateInterestCharges();

      expect(installmentsRepo.upsertInterestCharge).toHaveBeenCalledWith(
        'inst-1',
        'admin-fee',
        50_000,
        4,
      );
      expect(installmentsRepo.upsertInterestCharge).toHaveBeenCalledWith(
        'inst-1',
        'mora',
        400_000, // cuarto período iniciado * 10% = 40% de 1.000.000
        4,
      );
    });
  });

  describe('detectDelinquentCustomers', () => {
    it('does nothing when no tenant has a threshold configured', async () => {
      prisma.creditConfig.findMany.mockResolvedValue([]);

      await service.detectDelinquentCustomers();

      expect(prisma.loan.findMany).not.toHaveBeenCalled();
    });

    it('creates a PENDING_REVIEW report when the oldest unpaid installment crosses the threshold', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      prisma.creditConfig.findMany.mockResolvedValue([
        { tenantId: TENANT, moraGraceDays: 0, delinquencyThresholdDays: 90 },
      ]);
      prisma.loan.findMany.mockResolvedValue([
        {
          id: 'loan-1',
          customerId: 'cust-1',
          // 95 días vencida, cruza el umbral de 90.
          installments: [
            { dueDate: new Date(now.getTime() - 95 * MS_PER_DAY) },
          ],
        },
      ]);

      await service.detectDelinquentCustomers();

      expect(prisma.delinquencyReport.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT,
          customerId: 'cust-1',
          loanId: 'loan-1',
          daysOverdue: 95,
        },
      });
    });

    it('does not create a report when below the threshold', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      prisma.creditConfig.findMany.mockResolvedValue([
        { tenantId: TENANT, moraGraceDays: 0, delinquencyThresholdDays: 90 },
      ]);
      prisma.loan.findMany.mockResolvedValue([
        {
          id: 'loan-1',
          customerId: 'cust-1',
          installments: [
            { dueDate: new Date(now.getTime() - 40 * MS_PER_DAY) },
          ], // 40 días vencida, no cruza el umbral de 90.
        },
      ]);

      await service.detectDelinquentCustomers();

      expect(prisma.delinquencyReport.create).not.toHaveBeenCalled();
    });

    it('does not duplicate or overwrite an existing report', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      prisma.creditConfig.findMany.mockResolvedValue([
        { tenantId: TENANT, moraGraceDays: 0, delinquencyThresholdDays: 90 },
      ]);
      prisma.loan.findMany.mockResolvedValue([
        {
          id: 'loan-1',
          customerId: 'cust-1',
          installments: [
            { dueDate: new Date(now.getTime() - 95 * MS_PER_DAY) },
          ],
        },
      ]);
      prisma.delinquencyReport.findUnique.mockResolvedValue({
        id: 'existing',
        status: 'REPORTED',
      });

      await service.detectDelinquentCustomers();

      expect(prisma.delinquencyReport.create).not.toHaveBeenCalled();
    });
  });
});
