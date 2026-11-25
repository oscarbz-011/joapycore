import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PayrollService } from './payroll.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRecord(overrides = {}) {
  return {
    id: 'rec-1',
    tenantId: 'tenant-1',
    period: '2025-06',
    status: 'PENDING',
    totalGross: 0,
    totalNet: 0,
    totalIpsEmployee: 0,
    totalIpsEmployer: 0,
    totalAguinaldo: 0,
    createdAt: new Date(),
    items: [],
    ...overrides,
  };
}

function makeEmployee(overrides = {}) {
  return {
    id: 'emp-1',
    tenantId: 'tenant-1',
    baseSalary: 2_500_000,
    isActive: true,
    terminationDate: null,
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('PayrollService', () => {
  let service: PayrollService;
  let payrollRepository: {
    getConfig: jest.Mock;
    upsertConfig: jest.Mock;
    findRecords: jest.Mock;
    sumItemsByRecord: jest.Mock;
    findRecord: jest.Mock;
    createRecord: jest.Mock;
    updateRecord: jest.Mock;
    createItem: jest.Mock;
    updateItem: jest.Mock;
  };
  let employeesRepository: { findAll: jest.Mock };

  beforeEach(() => {
    payrollRepository = {
      getConfig: jest.fn().mockResolvedValue(null),
      upsertConfig: jest.fn(),
      findRecords: jest.fn().mockResolvedValue([]),
      sumItemsByRecord: jest.fn().mockResolvedValue([]),
      findRecord: jest.fn(),
      createRecord: jest.fn().mockResolvedValue({ id: 'rec-1' }),
      updateRecord: jest.fn(),
      createItem: jest.fn(),
      updateItem: jest.fn(),
    };
    employeesRepository = {
      findAll: jest.fn().mockResolvedValue([]),
    };

    service = new PayrollService(
      payrollRepository as any,
      employeesRepository as any,
    );
  });

  // ── listRecords ────────────────────────────────────────────────────────────

  describe('listRecords', () => {
    it('adds the totals of each record and zero for a record without items', async () => {
      payrollRepository.findRecords.mockResolvedValue([
        makeRecord({ id: 'rec-1' }),
        makeRecord({ id: 'rec-2' }),
      ]);
      payrollRepository.sumItemsByRecord.mockResolvedValue([
        {
          payrollRecordId: 'rec-1',
          _sum: {
            grossSalary: new Prisma.Decimal(2_600_000),
            netSalary: new Prisma.Decimal(2_384_000),
            ipsEmployee: new Prisma.Decimal(216_000),
            ipsEmployer: new Prisma.Decimal(396_000),
            aguinaldo: new Prisma.Decimal(200_000),
          },
        },
      ]);

      const [first, second] = await service.listRecords('tenant-1');

      expect(payrollRepository.sumItemsByRecord).toHaveBeenCalledWith(
        'tenant-1',
        ['rec-1', 'rec-2'],
      );
      expect(first).toMatchObject({
        id: 'rec-1',
        totalGross: new Prisma.Decimal(2_600_000),
        totalNet: new Prisma.Decimal(2_384_000),
        totalIpsEmployee: new Prisma.Decimal(216_000),
        totalIpsEmployer: new Prisma.Decimal(396_000),
        totalAguinaldo: new Prisma.Decimal(200_000),
      });
      expect(second.totalNet).toEqual(new Prisma.Decimal(0));
    });
  });

  // ── runPayroll ─────────────────────────────────────────────────────────────

  describe('runPayroll', () => {
    it('throws UnprocessableEntityException if a record already exists for that period', async () => {
      payrollRepository.findRecords.mockResolvedValue([
        makeRecord({ period: '2025-06' }),
      ]);

      await expect(
        service.runPayroll('tenant-1', '2025-06'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);

      expect(payrollRepository.createRecord).not.toHaveBeenCalled();
    });

    it('creates items with correct IPS calculation using default rates (9% / 16.5%)', async () => {
      const emp = makeEmployee({ baseSalary: 2_500_000 });
      employeesRepository.findAll.mockResolvedValue([emp]);
      payrollRepository.findRecord.mockResolvedValue(makeRecord());

      await service.runPayroll('tenant-1', '2025-06');

      // IPS employee = 2_500_000 * 0.09 = 225_000
      // IPS employer = 2_500_000 * 0.165 = 412_500
      // net = 2_500_000 - 225_000 = 2_275_000 (no aguinaldo in June)
      expect(payrollRepository.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          employeeId: 'emp-1',
          baseSalary: new Prisma.Decimal(2_500_000),
          grossSalary: new Prisma.Decimal(2_500_000),
          aguinaldo: new Prisma.Decimal(0),
          ipsEmployee: new Prisma.Decimal(225_000),
          ipsEmployer: new Prisma.Decimal(412_500),
          netSalary: new Prisma.Decimal(2_275_000),
        }),
      );
    });

    it('adds aguinaldo (1/12 of salary) when period is December', async () => {
      const emp = makeEmployee({ baseSalary: 2_400_000 });
      employeesRepository.findAll.mockResolvedValue([emp]);
      payrollRepository.findRecord.mockResolvedValue(
        makeRecord({ period: '2025-12' }),
      );

      await service.runPayroll('tenant-1', '2025-12');

      // aguinaldo = 2_400_000 / 12 = 200_000
      // gross = 2_400_000 + 200_000 = 2_600_000
      // ipsEmployee = 2_400_000 * 0.09 = 216_000
      // net = 2_600_000 - 216_000 = 2_384_000
      expect(payrollRepository.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          aguinaldo: new Prisma.Decimal(200_000),
          grossSalary: new Prisma.Decimal(2_600_000),
          ipsEmployee: new Prisma.Decimal(216_000),
          netSalary: new Prisma.Decimal(2_384_000),
        }),
      );
    });

    it('rounds aguinaldo and IPS to whole guaraníes from a Decimal salary', async () => {
      const emp = makeEmployee({ baseSalary: new Prisma.Decimal('2500001') });
      employeesRepository.findAll.mockResolvedValue([emp]);
      payrollRepository.findRecord.mockResolvedValue(
        makeRecord({ period: '2025-12' }),
      );

      await service.runPayroll('tenant-1', '2025-12');

      // 2_500_001 / 12 = 208_333.42 → 208_333; × 0.09 = 225_000.09 → 225_000
      expect(payrollRepository.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          aguinaldo: new Prisma.Decimal(208_333),
          grossSalary: new Prisma.Decimal(2_708_334),
          ipsEmployee: new Prisma.Decimal(225_000),
          netSalary: new Prisma.Decimal(2_483_334),
        }),
      );
    });

    it('uses configured IPS rates when payroll config exists', async () => {
      const emp = makeEmployee({ baseSalary: 1_000_000 });
      employeesRepository.findAll.mockResolvedValue([emp]);
      payrollRepository.getConfig.mockResolvedValue({
        ipsEmployeeRate: 0.1,
        ipsEmployerRate: 0.2,
        minimumWage: 500_000,
      });
      payrollRepository.findRecord.mockResolvedValue(makeRecord());

      await service.runPayroll('tenant-1', '2025-06');

      // ipsEmployee = 1_000_000 * 0.10 = 100_000
      expect(payrollRepository.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          ipsEmployee: new Prisma.Decimal(100_000),
          ipsEmployer: new Prisma.Decimal(200_000),
        }),
      );
    });

    it('skips terminated employees', async () => {
      const active = makeEmployee({ id: 'emp-active' });
      const terminated = makeEmployee({
        id: 'emp-term',
        terminationDate: new Date(),
      });
      employeesRepository.findAll.mockResolvedValue([active, terminated]);
      payrollRepository.findRecord.mockResolvedValue(makeRecord());

      await service.runPayroll('tenant-1', '2025-06');

      expect(payrollRepository.createItem).toHaveBeenCalledTimes(1);
      expect(payrollRepository.createItem).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: 'emp-active' }),
      );
    });

    it('creates no items when there are no active employees', async () => {
      employeesRepository.findAll.mockResolvedValue([]);
      payrollRepository.findRecord.mockResolvedValue(makeRecord());

      await service.runPayroll('tenant-1', '2025-06');

      expect(payrollRepository.createItem).not.toHaveBeenCalled();
    });
  });

  // ── markPaid ───────────────────────────────────────────────────────────────

  describe('markPaid', () => {
    it('marks a PENDING record as PAID', async () => {
      payrollRepository.findRecord
        .mockResolvedValueOnce(makeRecord({ status: 'PENDING' }))
        .mockResolvedValueOnce(makeRecord({ status: 'PAID' }));

      const result = await service.markPaid('tenant-1', 'rec-1');

      expect(payrollRepository.updateRecord).toHaveBeenCalledWith(
        'tenant-1',
        'rec-1',
        expect.objectContaining({ status: 'PAID' }),
      );
      expect(result.status).toBe('PAID');
    });

    it('throws UnprocessableEntityException if already paid', async () => {
      payrollRepository.findRecord.mockResolvedValue(
        makeRecord({ status: 'PAID' }),
      );

      await expect(
        service.markPaid('tenant-1', 'rec-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('throws NotFoundException for an unknown record', async () => {
      payrollRepository.findRecord.mockResolvedValue(null);

      await expect(
        service.markPaid('tenant-1', 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── updateConfig ───────────────────────────────────────────────────────────

  describe('updateConfig', () => {
    it('delegates to upsertConfig with the provided rates', async () => {
      await service.updateConfig('tenant-1', {
        minimumWage: 600_000,
        ipsEmployeeRate: 0.09,
        ipsEmployerRate: 0.165,
      });

      expect(payrollRepository.upsertConfig).toHaveBeenCalledWith('tenant-1', {
        minimumWage: 600_000,
        ipsEmployeeRate: 0.09,
        ipsEmployerRate: 0.165,
      });
    });
  });
});
