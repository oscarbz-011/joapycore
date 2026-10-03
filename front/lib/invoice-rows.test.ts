import { describe, expect, it } from 'vitest';
import type { InterestInvoice, Invoice } from './api/billing';
import { filterInvoiceRows, toInvoiceRows } from './invoice-rows';

const sale = {
  id: 'sale-0001',
  status: 'ISSUED',
  issuedAt: '2026-08-16T12:00:00.000Z',
  createdAt: '2026-08-16T11:00:00.000Z',
  total: '390000',
  invoiceNumber: '0000010',
  invoicePrefix: '001-001-',
  saleOrder: {
    saleType: 'CREDIT',
    installments: 10,
    customer: { firstName: 'Maria', lastName: 'Gonzalez', email: 'maria@mail.com' },
  },
} as unknown as Invoice;

const interest: InterestInvoice = {
  id: 'interest-1',
  status: 'PAID',
  issuedAt: '2026-10-03T01:09:49.967Z',
  createdAt: '2026-10-03T01:09:49.967Z',
  total: '4212',
  invoiceNumber: '0000011',
  invoicePrefix: '001-001-',
  pdfFileId: 'file-1',
  paymentReceipt: {
    id: 'receipt-1',
    receiptNumber: '001-001-0000020',
    customer: { id: 'c1', firstName: 'Maria', lastName: 'Gonzalez', email: null },
  },
};

describe('toInvoiceRows', () => {
  it('lists interest invoices next to sale invoices, newest first', () => {
    const rows = toInvoiceRows([sale], [interest]);

    expect(rows.map((row) => row.id)).toEqual(['interest-1', 'sale-0001']);
    expect(rows[0]).toMatchObject({
      kind: 'INTEREST',
      number: '001-001-0000011',
      customerName: 'Maria Gonzalez',
      typeLabel: 'Intereses · Recibo 001-001-0000020',
      total: 4212,
      pdfFileId: 'file-1',
    });
    expect(rows[1]).toMatchObject({
      kind: 'SALE',
      typeLabel: 'Crédito · 10c',
      total: 390000,
    });
  });

  it('keeps an interest invoice even without its receipt data', () => {
    const [row] = toInvoiceRows([], [{ ...interest, paymentReceipt: null }]);

    expect(row).toMatchObject({ customerName: '—', typeLabel: 'Intereses' });
  });
});

describe('filterInvoiceRows', () => {
  const rows = toInvoiceRows([sale], [interest]);

  it('filters by kind', () => {
    expect(
      filterInvoiceRows(rows, { search: '', status: '', kind: 'INTEREST' }).map(
        (row) => row.id,
      ),
    ).toEqual(['interest-1']);
  });

  it('filters by status and searches by customer or invoice number', () => {
    expect(
      filterInvoiceRows(rows, { search: '', status: 'ISSUED', kind: '' }),
    ).toHaveLength(1);
    expect(
      filterInvoiceRows(rows, { search: '0000011', status: '', kind: '' }).map(
        (row) => row.id,
      ),
    ).toEqual(['interest-1']);
    expect(
      filterInvoiceRows(rows, { search: 'gonz', status: '', kind: '' }),
    ).toHaveLength(2);
  });
});
