import { describe, expect, it } from 'vitest';
import type { BillingSeries } from './api/billing';
import { invoicingFormProblem, seriesForTerminal } from './pos-terminal';
import { STANDARD_PREPRINTED_LAYOUT } from './preprinted-form';

function makeSeries(overrides: Partial<BillingSeries> = {}): BillingSeries {
  return {
    id: 'series-1',
    branchId: 'branch-1',
    documentType: 'INVOICE',
    modality: 'SELF_PRINTED',
    timbrado: '12345678',
    validFrom: '2026-01-01',
    validUntil: '2026-12-31',
    establecimiento: '001',
    puntoExpedicion: '002',
    serieCode: '',
    rangeFrom: 1,
    rangeTo: 500,
    nextNumber: 1,
    isActive: true,
    printLayout: STANDARD_PREPRINTED_LAYOUT,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    branch: { id: 'branch-1', name: 'Central' },
    _count: { invoices: 0 },
    ...overrides,
  };
}

describe('seriesForTerminal', () => {
  it('offers only active invoice series of the branch that are not electronic', () => {
    const series = [
      makeSeries({ id: 'ok' }),
      makeSeries({ id: 'talonario', modality: 'PREPRINTED' }),
      makeSeries({ id: 'other-branch', branchId: 'branch-2' }),
      makeSeries({ id: 'credit-note', documentType: 'CREDIT_NOTE' }),
      makeSeries({ id: 'inactive', isActive: false }),
      makeSeries({ id: 'electronic', modality: 'ELECTRONIC' }),
    ];

    expect(seriesForTerminal(series, 'branch-1').map((s) => s.id)).toEqual(['ok', 'talonario']);
  });
});

describe('invoicingFormProblem', () => {
  const base = {
    invoiceSeriesId: 'series-1',
    thermalPaperReportFileId: null,
    thermalPaperConservation: '',
  };

  it('lets A4 and half letter print without the paper report', () => {
    expect(invoicingFormProblem({ ...base, printFormat: 'A4' })).toBeNull();
    expect(invoicingFormProblem({ ...base, printFormat: 'HALF_LETTER' })).toBeNull();
  });

  it('asks for the report and conservation conditions to print on thermal paper', () => {
    expect(invoicingFormProblem({ ...base, printFormat: 'THERMAL_80' })).toMatch(/informe/);
    expect(
      invoicingFormProblem({
        ...base,
        printFormat: 'THERMAL_58',
        thermalPaperReportFileId: 'file-1',
        thermalPaperConservation: 'Lejos del calor',
      }),
    ).toBeNull();
  });
});
