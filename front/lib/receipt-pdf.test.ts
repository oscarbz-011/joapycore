import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api/api-error';
import type { PaymentReceipt } from './api/finance';
import { isMissingReceipt, openReceiptDocument } from './receipt-pdf';

const receipt = (overrides: Partial<PaymentReceipt> = {}) =>
  ({
    id: 'receipt-1',
    pdfFileId: 'file-receipt',
    interestInvoice: null,
    ...overrides,
  }) as PaymentReceipt;

describe('openReceiptDocument', () => {
  it('opens an existing PDF without regenerating anything', async () => {
    const retry = vi.fn();
    const open = vi.fn().mockResolvedValue(undefined);

    await openReceiptDocument(receipt(), 'receipt', { retry, open });

    expect(retry).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledWith('file-receipt');
  });

  it('regenerates a missing receipt PDF and opens the new file', async () => {
    const regenerated = receipt({ pdfFileId: 'file-new' });
    const retry = vi.fn().mockResolvedValue(regenerated);
    const open = vi.fn().mockResolvedValue(undefined);

    const result = await openReceiptDocument(
      receipt({ pdfFileId: null }),
      'receipt',
      { retry, open },
    );

    expect(retry).toHaveBeenCalledWith('receipt-1');
    expect(open).toHaveBeenCalledWith('file-new');
    expect(result).toBe(regenerated);
  });

  it('regenerates a missing interest invoice PDF', async () => {
    const retry = vi.fn().mockResolvedValue(
      receipt({
        interestInvoice: {
          id: 'inv-1',
          pdfFileId: 'file-invoice',
          invoiceNumber: '1',
          invoicePrefix: '001-001-',
        },
      }),
    );
    const open = vi.fn().mockResolvedValue(undefined);

    await openReceiptDocument(
      receipt({
        interestInvoice: {
          id: 'inv-1',
          pdfFileId: null,
          invoiceNumber: '1',
          invoicePrefix: '001-001-',
        },
      }),
      'interestInvoice',
      { retry, open },
    );

    expect(open).toHaveBeenCalledWith('file-invoice');
  });

  it('fails without opening anything when the PDF is still missing', async () => {
    const open = vi.fn();

    await expect(
      openReceiptDocument(receipt({ pdfFileId: null }), 'receipt', {
        retry: vi.fn().mockResolvedValue(receipt({ pdfFileId: null })),
        open,
      }),
    ).rejects.toThrow();
    expect(open).not.toHaveBeenCalled();
  });
});

describe('isMissingReceipt', () => {
  it('recognizes the 404 of installments paid before receipts existed', () => {
    expect(isMissingReceipt(new ApiError('No hay recibo', 404))).toBe(true);
    expect(isMissingReceipt(new ApiError('Error', 500))).toBe(false);
    expect(isMissingReceipt(new Error('red'))).toBe(false);
  });
});
