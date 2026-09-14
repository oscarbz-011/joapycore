import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { FinanceSourcesRepository } from '../repositories/finance-sources.repository';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { LoansRepository } from '../repositories/loans.repository';
import { InstallmentsSchedulerService } from './installments-scheduler.service';
import { InterestCalcService } from './interest-calc.service';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TENANT = 'tenant-1';

describe('InstallmentsSchedulerService', () => {
  let service: InstallmentsSchedulerService;
  let installmentsRepo: jest.Mocked<InstallmentsRepository>;
  let prisma: {
    creditConfig: { findMany: jest.Mock };
    loan: { findMany: jest.Mock };
    delinquencyReport: { findUnique: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    const mockInstallmentsRepo = {
      markAllOverdue: jest.fn(),
      findAllOverdueForMora: jest.fn(),
      upsertInterestCharge: jest.fn().mockResolvedValue({}),
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
    it('does not charge while the installment is still within the tolerance window', async () => {
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

      expect(installmentsRepo.upsertInterestCharge).not.toHaveBeenCalled();
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
        0,
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

      // Vencida hace 95 días, sin tolerancia -> 3 períodos de 30 días completos.
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
        3,
      );
      expect(installmentsRepo.upsertInterestCharge).toHaveBeenCalledWith(
        'inst-1',
        'mora',
        300_000, // 3 períodos * 10% = 30% de 1.000.000
        3,
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
