import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PayrollService } from './payroll.service';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeRecord(overrides = {}) {
  return {
    id: 'rec-1',
    tenantId: 'tenant-1',
    period: '2025-06',
    status: 'DRAFT',
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
          baseSalary: 2_500_000,
          grossSalary: 2_500_000,
          aguinaldo: 0,
          ipsEmployee: 225_000,
          ipsEmployer: 412_500,
          netSalary: 2_275_000,
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
          aguinaldo: 200_000,
          grossSalary: 2_600_000,
          ipsEmployee: 216_000,
          netSalary: 2_384_000,
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
        expect.objectContaining({ ipsEmployee: 100_000, ipsEmployer: 200_000 }),
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
    it('marks a DRAFT record as PAID', async () => {
      payrollRepository.findRecord
        .mockResolvedValueOnce(makeRecord({ status: 'DRAFT' }))
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
