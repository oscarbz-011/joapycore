import { describe, expect, it } from 'vitest';
import { invoiceDetailLines, invoiceIvaSummary, ivaRateLabel } from './invoice-detail';

const items = [
  { id: 'a', description: 'Heladera', quantity: 1, unitPrice: 2_200_000, total: 2_200_000, ivaRate: 10 },
  { id: 'b', description: 'Arroz', quantity: 2, unitPrice: 10_500, total: 21_000, ivaRate: 5 },
  { id: 'c', description: 'Libro', quantity: 1, unitPrice: 50_000, total: 50_000, ivaRate: null },
];

describe('invoiceDetailLines', () => {
  it('keeps each item total on a cash invoice', () => {
    const lines = invoiceDetailLines(items, 2_271_000, false);
    expect(lines.map((l) => l.total)).toEqual([2_200_000, 21_000, 50_000]);
    expect(lines[2].ivaRate).toBe(0);
  });

  it('spreads the financed total over the items on a credit invoice', () => {
    const lines = invoiceDetailLines(items.slice(0, 1), 2_640_000, true);
    expect(lines[0].total).toBe(2_640_000);
  });
});

describe('invoiceIvaSummary', () => {
  it('splits the amounts by rate and liquidates the IVA included in the prices', () => {
    expect(invoiceIvaSummary(invoiceDetailLines(items, 2_271_000, false))).toEqual({
      exempt: 50_000,
      taxed5: 21_000,
      taxed10: 2_200_000,
      iva5: 1_000,
      iva10: 200_000,
      ivaTotal: 201_000,
    });
  });
});

describe('ivaRateLabel', () => {
  it.each([
    [10, '10%'],
    [5, '5%'],
    [0, 'Exenta'],
  ])('labels %i as %s', (rate, label) => {
    expect(ivaRateLabel(rate)).toBe(label);
  });
});
