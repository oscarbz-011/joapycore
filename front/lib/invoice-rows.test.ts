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

    // 0000011 (intereses) es posterior a 0000010 (venta) en la secuencia.
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

describe('fiscal order', () => {
  const withNumber = (id: string, number: string, issuedAt: string) =>
    ({
      ...sale,
      id,
      invoiceNumber: number,
      issuedAt,
    }) as unknown as Invoice;

  it('orders by invoice number even when a date is out of sequence', () => {
    const rows = toInvoiceRows(
      [
        withNumber('n26', '0000026', '2026-09-19T18:51:55.000Z'),
        // Emitida con el reloj atrasado: fecha de abril, número 27.
        withNumber('n27', '0000027', '2026-04-02T01:27:27.000Z'),
      ],
      [interest],
    );

    expect(rows.map((row) => row.fiscalNumber)).toEqual([
      '001-001-0000027',
      '001-001-0000026',
      '001-001-0000011',
    ]);
  });

  it('lists drafts without a number first, newest first', () => {
    const draft = (id: string, createdAt: string) =>
      ({
        ...sale,
        id,
        status: 'PENDING',
        invoiceNumber: null,
        issuedAt: null,
        createdAt,
      }) as unknown as Invoice;

    const rows = toInvoiceRows(
      [
        withNumber('n26', '0000026', '2026-09-19T18:51:55.000Z'),
        draft('old-draft', '2026-09-01T10:00:00.000Z'),
        draft('new-draft', '2026-10-01T10:00:00.000Z'),
      ],
      [],
    );

    expect(rows.map((row) => row.id)).toEqual(['new-draft', 'old-draft', 'n26']);
  });
});

describe('legacy invoices without a number', () => {
  it('go after numbered invoices, not before them like drafts', () => {
    const legacy = {
      ...sale,
      id: 'legacy',
      status: 'ISSUED',
      invoiceNumber: null,
      issuedAt: '2026-08-17T12:00:00.000Z',
    } as unknown as Invoice;
    const draft = {
      ...sale,
      id: 'draft',
      status: 'PENDING',
      invoiceNumber: null,
      issuedAt: null,
      createdAt: '2026-08-01T12:00:00.000Z',
    } as unknown as Invoice;

    const rows = toInvoiceRows([legacy, sale, draft], []);

    expect(rows.map((row) => row.id)).toEqual(['draft', 'sale-0001', 'legacy']);
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
