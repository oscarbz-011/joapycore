import { describe, expect, it } from 'vitest';
import { canRetryInvoicePdf } from './api/billing';

describe('canRetryInvoicePdf', () => {
  it.each([
    ['PENDING', null, false],
    ['ISSUED', null, true],
    ['PAID', null, true],
    ['CANCELLED', null, false],
    ['ISSUED', 'pdf-1', false],
    ['PAID', 'pdf-1', false],
  ] as const)('allows retry for %s with PDF %s: %s', (status, pdfFileId, expected) => {
    expect(canRetryInvoicePdf({ status, pdfFileId })).toBe(expected);
  });
});
