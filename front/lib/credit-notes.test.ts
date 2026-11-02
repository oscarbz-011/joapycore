import { describe, expect, it } from 'vitest';
import type { CreditableInvoiceItem, CreditNote } from './api/billing';
import {
  billingEventDetail,
  canCreditInvoice,
  canVoidInvoice,
  creditDraftProblem,
  creditDraftTotal,
  creditNoteCustomerName,
  creditNoteInvoiceNumber,
  creditNoteNumber,
  creditSplit,
  invoiceCreditState,
} from './credit-notes';

const NOTE = {
  id: 'abcdef123456',
  number: '0000007',
  numberPrefix: '001-001-',
  customer: { id: 'c-1', firstName: 'Maria', lastName: 'Perez', email: null },
  invoice: {
    id: 'inv-1',
    invoicePrefix: '001-002-',
    invoiceNumber: '0000009',
    total: 2_200_000,
    issuedAt: null,
    status: 'ISSUED',
    saleOrder: null,
  },
} as unknown as CreditNote;

const ITEMS: CreditableInvoiceItem[] = [
  {
    invoiceItemId: 'ii-1',
    description: 'Heladera',
    quantity: 2,
    creditableQuantity: 2,
    unitPrice: 1_100_000,
    ivaRate: 10,
    saleOrderItemId: 'soi-1',
    restockable: true,
    isSerialized: true,
    soldSerials: ['SN-1', 'SN-2'],
  },
  {
    invoiceItemId: 'ii-2',
    description: 'Arroz',
    quantity: 3,
    creditableQuantity: 1,
    unitPrice: 10_500,
    ivaRate: 5,
    saleOrderItemId: 'soi-2',
    restockable: true,
    isSerialized: false,
    soldSerials: [],
  },
];

describe('credit note labels', () => {
  it('shows the 13-digit number, or the old internal one', () => {
    expect(creditNoteNumber(NOTE)).toBe('001-001-0000007');
    expect(creditNoteNumber({ ...NOTE, number: null, numberPrefix: null })).toBe('NC-ABCDEF');
  });

  it('shows the invoice it modifies and the customer', () => {
    expect(creditNoteInvoiceNumber(NOTE)).toBe('001-002-0000009');
    expect(creditNoteCustomerName(NOTE)).toBe('Maria Perez');
    expect(creditNoteCustomerName({ ...NOTE, customer: null })).toBe('Sin Nombre');
  });

  it.each([
    [{ type: 'CREDIT_NOTE_ISSUED', detail: { number: '001-001-0000007', total: 110000 } }, '001-001-0000007 · Gs. 110.000'],
    [{ type: 'SHEET_VOIDED', detail: { voidedSheet: 41, movedTo: 42, reason: 'Se trabó' } }, 'Hoja 41 · pasó a la 42 · Se trabó'],
    [{ type: 'VOIDED', detail: { reason: 'Error de carga' } }, 'Error de carga'],
    [{ type: 'REFUNDED', detail: { amount: 50000, method: 'CASH' } }, 'Gs. 50.000'],
    [{ type: 'ISSUED', detail: null }, ''],
  ])('describes event %j', (event, text) => {
    expect(billingEventDetail(event as never)).toBe(text);
  });
});

describe('what can be done with an invoice', () => {
  it.each([
    [{ creditedTotal: 0 }, 'none'],
    [{ creditedTotal: '100000' }, 'partial'],
    [{ creditedTotal: 2_200_000 }, 'full'],
  ])('credit state of %j is %s', (overrides, state) => {
    expect(invoiceCreditState({ total: 2_200_000, ...overrides } as never)).toBe(state);
  });

  it('credits an issued or paid invoice with something left to credit', () => {
    expect(canCreditInvoice({ status: 'ISSUED', total: 1000, creditedTotal: 0 })).toBe(true);
    expect(canCreditInvoice({ status: 'PAID', total: 1000, creditedTotal: 400 })).toBe(true);
    expect(canCreditInvoice({ status: 'PAID', total: 1000, creditedTotal: 1000 })).toBe(false);
    expect(canCreditInvoice({ status: 'PENDING', total: 1000, creditedTotal: 0 })).toBe(false);
    expect(canCreditInvoice({ status: 'CANCELLED', total: 1000, creditedTotal: 0 })).toBe(false);
  });

  it('voids only a sale invoice without credit notes', () => {
    const base = { status: 'ISSUED' as const, invoiceType: 'SALE' as const, total: 1000, creditedTotal: 0 };
    expect(canVoidInvoice(base)).toBe(true);
    expect(canVoidInvoice({ ...base, creditedTotal: 10 })).toBe(false);
    expect(canVoidInvoice({ ...base, invoiceType: 'INTEREST' })).toBe(false);
    expect(canVoidInvoice({ ...base, status: 'CANCELLED' })).toBe(false);
  });
});

describe('credit note draft', () => {
  const lines = {
    'ii-1': { quantity: 1, restockQuantity: 1, serialNumbers: ['SN-2'] },
    'ii-2': { quantity: 1, restockQuantity: 0, serialNumbers: [] },
  };

  it('totals what is credited by kind', () => {
    expect(creditDraftTotal('TOTAL', ITEMS, lines, 0, 2_231_500)).toBe(2_231_500);
    expect(creditDraftTotal('ITEMS', ITEMS, lines, 0, 2_231_500)).toBe(1_110_500);
    expect(creditDraftTotal('AMOUNT', ITEMS, lines, 50_000, 2_231_500)).toBe(50_000);
  });

  it('discounts the debt first and leaves the rest as excess', () => {
    expect(creditSplit(500_000, 200_000)).toEqual({ applied: 200_000, excess: 300_000 });
    expect(creditSplit(500_000, 900_000)).toEqual({ applied: 500_000, excess: 0 });
  });

  const base = { kind: 'ITEMS' as const, reason: 'Devolución', total: 1_110_500, remaining: 2_231_500, items: ITEMS, lines };

  it('is ready with a reason, items and the serial numbers that come back', () => {
    expect(creditDraftProblem(base)).toBeNull();
  });

  it.each([
    [{ reason: 'ab' }, 'Escribí el motivo'],
    [{ total: 0 }, 'al menos un ítem'],
    [{ kind: 'AMOUNT' as const, total: 0 }, 'importe del descuento'],
    [{ total: 3_000_000 }, 'supera lo que queda por acreditar'],
    [{ lines: { ...lines, 'ii-2': { quantity: 2, restockQuantity: 0, serialNumbers: [] } } }, 'hasta 1 unidades'],
    [{ lines: { ...lines, 'ii-1': { quantity: 1, restockQuantity: 2, serialNumbers: ['SN-1', 'SN-2'] } } }, 'vuelven al stock hasta 1'],
    [{ lines: { ...lines, 'ii-1': { quantity: 1, restockQuantity: 1, serialNumbers: [] } } }, 'un número de serie por cada unidad'],
  ])('rejects %j', (overrides, message) => {
    expect(creditDraftProblem({ ...base, ...overrides })).toContain(message);
  });
});
