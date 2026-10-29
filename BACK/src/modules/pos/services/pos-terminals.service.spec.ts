import { NotFoundException } from '@nestjs/common';
import { PosTerminalsService } from './pos-terminals.service';

function makeTerminal(overrides: Record<string, unknown> = {}) {
  return {
    id: 'terminal-1',
    tenantId: 'tenant-1',
    branchId: 'branch-1',
    name: 'Caja 1',
    isActive: true,
    invoiceSeriesId: null,
    printFormat: 'A4',
    thermalPaperReportFileId: null,
    thermalPaperConservation: null,
    ...overrides,
  };
}

const SERIES = {
  id: 'series-1',
  branchId: 'branch-1',
  modality: 'SELF_PRINTED',
  isInvoiceSeries: true,
  problem: null,
};

describe('PosTerminalsService', () => {
  let repo: { findById: jest.Mock; update: jest.Mock };
  let billing: { findSeries: jest.Mock };
  let files: { getById: jest.Mock };
  let service: PosTerminalsService;

  beforeEach(() => {
    repo = {
      findById: jest.fn().mockResolvedValue(makeTerminal()),
      update: jest.fn((_t, _id, data) => Promise.resolve(data)),
    };
    billing = { findSeries: jest.fn().mockResolvedValue(SERIES) };
    files = { getById: jest.fn().mockResolvedValue({ id: 'file-1' }) };
    service = new PosTerminalsService(
      repo as any,
      billing as any,
      files as any,
    );
  });

  it('assigns an invoice series of the branch of the cash register', async () => {
    await service.update('tenant-1', 'terminal-1', {
      invoiceSeriesId: 'series-1',
    });

    expect(billing.findSeries).toHaveBeenCalledWith('tenant-1', 'series-1');
    expect(repo.update).toHaveBeenCalledWith(
      'tenant-1',
      'terminal-1',
      expect.objectContaining({ invoiceSeriesId: 'series-1' }),
    );
  });

  it.each([
    ['of another tenant', null],
    ['of another branch', { ...SERIES, branchId: 'branch-2' }],
    ['of credit notes', { ...SERIES, isInvoiceSeries: false }],
  ])('rejects a series %s', async (_label, series) => {
    billing.findSeries.mockResolvedValue(series);

    await expect(
      service.update('tenant-1', 'terminal-1', { invoiceSeriesId: 'series-1' }),
    ).rejects.toThrow(
      'La serie tiene que ser de facturas y de la sucursal de la caja',
    );
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('does not let a cash register print the invoice on thermal paper without the durability report', async () => {
    await expect(
      service.update('tenant-1', 'terminal-1', { printFormat: 'THERMAL_80' }),
    ).rejects.toThrow('cargá el informe de durabilidad del papel');

    await expect(
      service.update('tenant-1', 'terminal-1', {
        printFormat: 'THERMAL_58',
        thermalPaperReportFileId: 'file-1',
        thermalPaperConservation: '   ',
      }),
    ).rejects.toThrow('RG 27/19');
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('prints on thermal paper once the report and its conservation conditions are loaded', async () => {
    await service.update('tenant-1', 'terminal-1', {
      printFormat: 'THERMAL_80',
      thermalPaperReportFileId: 'file-1',
      thermalPaperConservation: '  Conservar lejos del calor y la luz  ',
    });

    expect(files.getById).toHaveBeenCalledWith('tenant-1', 'file-1');
    expect(repo.update).toHaveBeenCalledWith(
      'tenant-1',
      'terminal-1',
      expect.objectContaining({
        printFormat: 'THERMAL_80',
        thermalPaperConservation: 'Conservar lejos del calor y la luz',
      }),
    );
  });

  it('keeps thermal printing valid when only the name changes', async () => {
    repo.findById.mockResolvedValue(
      makeTerminal({
        printFormat: 'THERMAL_80',
        thermalPaperReportFileId: 'file-1',
        thermalPaperConservation: 'Conservar lejos del calor',
      }),
    );

    await service.update('tenant-1', 'terminal-1', { name: 'Caja 2' });

    expect(repo.update).toHaveBeenCalled();
  });

  it('rejects a report file of another tenant', async () => {
    files.getById.mockRejectedValue(new NotFoundException());

    await expect(
      service.update('tenant-1', 'terminal-1', {
        thermalPaperReportFileId: 'foreign',
      }),
    ).rejects.toThrow('El informe del papel térmico no existe');
  });

  it('returns 404 for a cash register of another tenant', async () => {
    repo.findById.mockResolvedValue(null);

    await expect(
      service.update('tenant-2', 'terminal-1', { name: 'X' }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(repo.findById).toHaveBeenCalledWith('tenant-2', 'terminal-1');
  });
});
