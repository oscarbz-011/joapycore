import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { InstallmentsRepository } from '../repositories/installments.repository';
import { InstallmentsSchedulerService } from './installments-scheduler.service';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TENANT = 'tenant-1';

describe('InstallmentsSchedulerService', () => {
  let service: InstallmentsSchedulerService;
  let installmentsRepo: jest.Mocked<InstallmentsRepository>;
  let prisma: { creditConfig: { findMany: jest.Mock } };

  beforeEach(async () => {
    const mockInstallmentsRepo = {
      markAllOverdue: jest.fn(),
      findAllOverdueForMora: jest.fn(),
      updateMora: jest.fn().mockResolvedValue({}),
    };
    const mockPrisma = {
      creditConfig: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstallmentsSchedulerService,
        { provide: InstallmentsRepository, useValue: mockInstallmentsRepo },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(InstallmentsSchedulerService);
    installmentsRepo = module.get(InstallmentsRepository);
    prisma = module.get(PrismaService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('applyDailyMora', () => {
    it('does not apply mora while the installment is still within the tolerance window', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 100000,
          moraAmount: 0,
          dueDate: new Date(now.getTime() - 2 * MS_PER_DAY), // vencida hace 2 días
          lastMoraCalculatedAt: null,
        },
      ] as never);
      prisma.creditConfig.findMany.mockResolvedValue([
        { tenantId: TENANT, moraRate: 1, moraGraceDays: 5 },
      ]);

      await service.applyDailyMora();

      expect(installmentsRepo.updateMora).not.toHaveBeenCalled();
    });

    it('applies mora only for the days elapsed after the tolerance window ends', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      // Vencida hace 10 días, tolerancia de 5 -> solo devenga mora por
      // (10 - 5) = 5 días, no por los 10 completos.
      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 100000,
          moraAmount: 0,
          dueDate: new Date(now.getTime() - 10 * MS_PER_DAY),
          lastMoraCalculatedAt: null,
        },
      ] as never);
      prisma.creditConfig.findMany.mockResolvedValue([
        { tenantId: TENANT, moraRate: 1, moraGraceDays: 5 },
      ]);

      await service.applyDailyMora();

      // 1% diario de 100000 = 1000/día * 5 días = 5000
      expect(installmentsRepo.updateMora).toHaveBeenCalledWith('inst-1', 5000);
    });

    it('skips installments when the tenant has no mora rate configured', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 100000,
          moraAmount: 0,
          dueDate: new Date(now.getTime() - 30 * MS_PER_DAY),
          lastMoraCalculatedAt: null,
        },
      ] as never);
      prisma.creditConfig.findMany.mockResolvedValue([
        { tenantId: TENANT, moraRate: 0, moraGraceDays: 0 },
      ]);

      await service.applyDailyMora();

      expect(installmentsRepo.updateMora).not.toHaveBeenCalled();
    });

    it('defaults to zero tolerance when moraGraceDays is not set', async () => {
      const now = new Date('2026-08-18T12:00:00Z');
      jest.useFakeTimers().setSystemTime(now);

      installmentsRepo.findAllOverdueForMora.mockResolvedValue([
        {
          id: 'inst-1',
          tenantId: TENANT,
          amount: 100000,
          moraAmount: 0,
          dueDate: new Date(now.getTime() - 3 * MS_PER_DAY),
          lastMoraCalculatedAt: null,
        },
      ] as never);
      prisma.creditConfig.findMany.mockResolvedValue([
        { tenantId: TENANT, moraRate: 1, moraGraceDays: 0 },
      ]);

      await service.applyDailyMora();

      // Sin tolerancia -> devenga por los 3 días completos vencidos.
      expect(installmentsRepo.updateMora).toHaveBeenCalledWith('inst-1', 3000);
    });
  });
});
