import { describe, expect, it } from 'vitest';
import type { PosInvoiceSeries, PosReceipt } from './api/pos';
import {
  needsTalonarioNumber,
  receiptHtml,
  seriesBlocker,
  talonarioNumberProblem,
  thermalProblem,
} from './pos-receipt';

function makeReceipt(overrides: Partial<PosReceipt> = {}): PosReceipt {
  return {
    invoiceId: 'inv-1',
    modality: 'SELF_PRINTED',
    number: '001-002-0000041',
    timbrado: '12345678',
    timbradoValidFrom: '2026-01-01T00:00:00.000Z',
    timbradoValidUntil: '2026-12-31T00:00:00.000Z',
    issuedAt: '2026-06-15T15:00:00.000Z',
    condition: 'CONTADO',
    issuer: {
      name: 'Mi Empresa S.A.',
      fantasyName: 'MiTienda',
      ruc: '80069563-1',
      address: 'Av. España 123',
      city: 'Asunción',
      phone: '021 555 555',
      activity: 'Venta de electrodomésticos',
      branchName: 'Central',
      branchAddress: 'Mcal. López 50',
    },
    buyer: { name: 'Sin Nombre', document: 'X', address: null },
    formLayout: null,
    lines: [
      { description: 'Licuadora <Pro>', quantity: 2, unitPrice: 110_000, total: 220_000, ivaRate: 10 },
    ],
    totals: {
      exempt: 0,
      taxed5: 0,
      taxed10: 220_000,
      iva5: 0,
      iva10: 20_000,
      ivaTotal: 20_000,
      total: 220_000,
    },
    copy: false,
    terminalName: 'Caja 1',
    cashierName: 'Ana Gómez',
    printFormat: 'THERMAL_80',
    paperConservation: 'Conservar lejos del calor y la luz',
    payments: [{ paymentMethod: 'CASH', amount: 250_000 }],
    change: 30_000,
    ...overrides,
  };
}

const SERIES: PosInvoiceSeries = {
  id: 'series-1',
  branchId: 'branch-1',
  modality: 'PREPRINTED',
  establecimiento: '001',
  puntoExpedicion: '002',
  timbrado: '12345678',
  rangeFrom: 1,
  rangeTo: 500,
  nextNumber: 42,
  isInvoiceSeries: true,
  problem: null,
};

describe('receiptHtml', () => {
  it('prints the fiscal data the DNIT requires', () => {
    const html = receiptHtml(makeReceipt());

    expect(html).toContain('Mi Empresa S.A.');
    expect(html).toContain('RUC: 80069563-1');
    expect(html).toContain('Timbrado N°');
    expect(html).toContain('12345678');
    expect(html).toContain('31/12/26');
    expect(html).toContain('N° 001-002-0000041');
    expect(html).toContain('Sin Nombre');
    expect(html).toContain('>X<');
    expect(html).toContain('Liquidación del IVA');
    expect(html).toContain('20.000');
    expect(html).toContain('ORIGINAL: CLIENTE');
  });

  it('sizes the page for the printer of the cash register', () => {
    expect(receiptHtml(makeReceipt({ printFormat: 'THERMAL_58' }))).toContain('size: 58mm auto');
    expect(receiptHtml(makeReceipt({ printFormat: 'THERMAL_80' }))).toContain('size: 80mm auto');
    expect(receiptHtml(makeReceipt({ printFormat: 'A4' }))).toContain('size: A4');
    expect(receiptHtml(makeReceipt({ printFormat: 'HALF_LETTER' }))).toContain('size: 5.5in 8.5in');
  });

  it('prints the paper conservation conditions only on thermal paper', () => {
    expect(receiptHtml(makeReceipt())).toContain('Conservar lejos del calor y la luz');
    expect(receiptHtml(makeReceipt({ printFormat: 'A4' }))).not.toContain('Conservar lejos');
  });

  it('marks a reprint as a copy', () => {
    const html = receiptHtml(makeReceipt({ copy: true }));
    expect(html).toContain('COPIA');
    expect(html).not.toContain('ORIGINAL');
  });

  it('says it is not the fiscal document when the invoice is a talonario page', () => {
    const html = receiptHtml(makeReceipt({ modality: 'PREPRINTED', printFormat: 'A4' }));
    expect(html).toContain('NO VÁLIDO COMO COMPROBANTE FISCAL');
    expect(html).not.toContain('ORIGINAL');
  });

  it('escapes text that comes from the catalog', () => {
    const html = receiptHtml(makeReceipt());
    expect(html).toContain('Licuadora &lt;Pro&gt;');
    expect(html).not.toContain('<Pro>');
  });

  it('shows the change', () => {
    expect(receiptHtml(makeReceipt())).toContain('Vuelto');
    expect(receiptHtml(makeReceipt({ change: 0 }))).not.toContain('Vuelto');
  });
});

describe('cash register invoicing rules', () => {
  it('blocks charging without an invoice series or with one that cannot number', () => {
    expect(seriesBlocker(null)).toMatch(/no tiene una serie de facturas/);
    expect(seriesBlocker({ ...SERIES, problem: 'El timbrado venció el 31/12/2025' })).toBe(
      'El timbrado venció el 31/12/2025',
    );
    expect(seriesBlocker(SERIES)).toBeNull();
  });

  it('asks for the talonario page number only with a printing-house talonario', () => {
    expect(needsTalonarioNumber(SERIES)).toBe(true);
    expect(needsTalonarioNumber({ ...SERIES, modality: 'SELF_PRINTED' })).toBe(false);
    expect(needsTalonarioNumber(null)).toBe(false);
  });

  it('checks the talonario page number against the range', () => {
    expect(talonarioNumberProblem(SERIES, '')).toMatch(/número de la hoja/);
    expect(talonarioNumberProblem(SERIES, '4.5')).toMatch(/entero positivo/);
    expect(talonarioNumberProblem(SERIES, '501')).toBe('El talonario va del 1 al 500');
    expect(talonarioNumberProblem(SERIES, '42')).toBeNull();
  });

  it('requires the durability report and conservation conditions for thermal paper', () => {
    expect(
      thermalProblem({ thermalPaperReportFileId: null, thermalPaperConservation: 'x' }),
    ).toMatch(/informe de durabilidad/);
    expect(
      thermalProblem({ thermalPaperReportFileId: 'file-1', thermalPaperConservation: '  ' }),
    ).toMatch(/condiciones de conservación/);
    expect(
      thermalProblem({ thermalPaperReportFileId: 'file-1', thermalPaperConservation: 'Lejos del calor' }),
    ).toBeNull();
  });
});
