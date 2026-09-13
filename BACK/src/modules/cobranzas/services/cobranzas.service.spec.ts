import { NotFoundException } from '@nestjs/common';
import { CobranzasService } from './cobranzas.service';

function makeReport(overrides = {}) {
  return {
    id: 'report-1',
    tenantId: 'tenant-1',
    customerId: 'customer-1',
    loanId: 'loan-1',
    monthsOverdue: 3,
    status: 'PENDING_REVIEW' as const,
    ...overrides,
  };
}

describe('CobranzasService — Morosos', () => {
  let service: CobranzasService;
  let delinquencyReportsRepo: {
    findAll: jest.Mock;
    findById: jest.Mock;
    updateStatus: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    delinquencyReportsRepo = {
      findAll: jest.fn(),
      findById: jest.fn(),
      updateStatus: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };

    service = new CobranzasService(
      {} as any, // prisma
      {} as any, // routesRepo
      {} as any, // visitsRepo
      {} as any, // agreementsRepo
      {} as any, // notesRepo
      delinquencyReportsRepo as any,
      eventEmitter as any,
    );
  });

  describe('findAllDelinquencyReports', () => {
    it('delegates to the repository with the status filter', async () => {
      delinquencyReportsRepo.findAll.mockResolvedValue([makeReport()]);
      await service.findAllDelinquencyReports('tenant-1', 'PENDING_REVIEW');
      expect(delinquencyReportsRepo.findAll).toHaveBeenCalledWith(
        'tenant-1',
        'PENDING_REVIEW',
      );
    });
  });

  describe('findDelinquencyReport', () => {
    it('throws NotFoundException when the report does not exist', async () => {
      delinquencyReportsRepo.findById.mockResolvedValue(null);
      await expect(
        service.findDelinquencyReport('tenant-1', 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateDelinquencyReportStatus', () => {
    it('marks a report as REPORTED with the given reference and notes', async () => {
      delinquencyReportsRepo.findById.mockResolvedValue(makeReport());
      delinquencyReportsRepo.updateStatus.mockResolvedValue(
        makeReport({ status: 'REPORTED', reference: 'EXP-123' }),
      );

      const result = await service.updateDelinquencyReportStatus(
        'tenant-1',
        'report-1',
        { status: 'REPORTED', reference: 'EXP-123' },
        'user-1',
      );

      expect(delinquencyReportsRepo.updateStatus).toHaveBeenCalledWith(
        'report-1',
        {
          status: 'REPORTED',
          reference: 'EXP-123',
          notes: undefined,
          reviewedById: 'user-1',
        },
      );
      expect(result.status).toBe('REPORTED');
    });

    it('marks a report as EXCLUDED', async () => {
      delinquencyReportsRepo.findById.mockResolvedValue(makeReport());
      delinquencyReportsRepo.updateStatus.mockResolvedValue(
        makeReport({ status: 'EXCLUDED', notes: 'Ya regularizó' }),
      );

      await service.updateDelinquencyReportStatus(
        'tenant-1',
        'report-1',
        { status: 'EXCLUDED', notes: 'Ya regularizó' },
        'user-1',
      );

      expect(delinquencyReportsRepo.updateStatus).toHaveBeenCalledWith(
        'report-1',
        {
          status: 'EXCLUDED',
          reference: undefined,
          notes: 'Ya regularizó',
          reviewedById: 'user-1',
        },
      );
    });

    it('emits an audit.log event with the status-specific action', async () => {
      delinquencyReportsRepo.findById.mockResolvedValue(makeReport());
      delinquencyReportsRepo.updateStatus.mockResolvedValue(
        makeReport({ status: 'REPORTED' }),
      );

      await service.updateDelinquencyReportStatus(
        'tenant-1',
        'report-1',
        { status: 'REPORTED' },
        'user-1',
      );

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        expect.objectContaining({
          tenantId: 'tenant-1',
          userId: 'user-1',
          module: 'collections',
          action: 'delinquency.report.reported',
          resourceId: 'report-1',
        }),
      );
    });

    it('throws NotFoundException before updating when the report does not exist', async () => {
      delinquencyReportsRepo.findById.mockResolvedValue(null);
      await expect(
        service.updateDelinquencyReportStatus(
          'tenant-1',
          'ghost',
          { status: 'EXCLUDED' },
          'user-1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(delinquencyReportsRepo.updateStatus).not.toHaveBeenCalled();
    });
  });
});
