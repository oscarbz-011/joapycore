import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PosReceipt } from './api/pos';

const printed = vi.hoisted(() => ({ html: [] as string[], forms: [] as unknown[] }));

vi.mock('./print-html', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./print-html')>()),
  printHtmlDocument: (html: string) => printed.html.push(html),
}));
vi.mock('./preprinted-form', () => ({
  printPreprintedForm: (_receipt: unknown, layout: unknown) => printed.forms.push(layout),
}));

const { printReceipt } = await import('./pos-receipt');
const { STANDARD_PREPRINTED_LAYOUT } = await vi.importActual<typeof import('./preprinted-form')>('./preprinted-form');

function receipt(overrides: Partial<PosReceipt> = {}): PosReceipt {
  return {
    invoiceId: 'inv-1',
    modality: 'SELF_PRINTED',
    number: '001-002-0000041',
    timbrado: '12345678',
    timbradoValidFrom: null,
    timbradoValidUntil: null,
    issuedAt: '2026-06-15T15:00:00.000Z',
    condition: 'CONTADO',
    issuer: {
      name: 'Mi Empresa S.A.',
      fantasyName: null,
      ruc: null,
      address: null,
      city: null,
      phone: null,
      activity: null,
      branchName: null,
      branchAddress: null,
    },
    buyer: { name: 'Sin Nombre', document: 'X', address: null },
    lines: [],
    totals: { exempt: 0, taxed5: 0, taxed10: 0, iva5: 0, iva10: 0, ivaTotal: 0, total: 0 },
    formLayout: null,
    copy: false,
    terminalName: 'Caja 1',
    cashierName: 'Ana',
    printFormat: 'A4',
    paperConservation: null,
    payments: [],
    change: 0,
    ...overrides,
  };
}

beforeEach(() => {
  printed.html = [];
  printed.forms = [];
});

describe('printReceipt', () => {
  it('prints a self-printed invoice in the format of the cash register', () => {
    printReceipt(receipt());
    expect(printed.html).toHaveLength(1);
    expect(printed.forms).toHaveLength(0);
  });

  it('prints a talonario invoice on the pre-printed sheet', () => {
    printReceipt(receipt({ modality: 'PREPRINTED', formLayout: STANDARD_PREPRINTED_LAYOUT }));
    expect(printed.forms).toEqual([STANDARD_PREPRINTED_LAYOUT]);
    expect(printed.html).toHaveLength(0);
  });
});
