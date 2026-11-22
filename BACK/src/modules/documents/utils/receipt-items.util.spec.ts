import { receiptItemLabels, type ReceiptLine } from './receipt-items.util';

const line = (
  installmentNumber: number,
  loanId: string,
  invoiceNumber: string | null,
  product: string,
): ReceiptLine => ({
  installmentNumber,
  installment: {
    loanId,
    loan: {
      saleOrder: {
        invoice: invoiceNumber
          ? { invoicePrefix: '001-001-', invoiceNumber }
          : null,
        items: [{ description: null, product: { name: product } }],
      },
    },
  },
});

describe('receiptItemLabels', () => {
  it('keeps the installment as item and concept for a single sale', () => {
    expect(
      receiptItemLabels([
        line(2, 'loan-a', '0000018', 'Ventilador'),
        line(3, 'loan-a', '0000018', 'Ventilador'),
      ]),
    ).toEqual([
      ['2', 'Cuota N° 2'],
      ['3', 'Cuota N° 3'],
    ]);
  });

  it('names the invoice and product of each line when there are several sales', () => {
    expect(
      receiptItemLabels([
        line(2, 'loan-a', '0000018', 'Ventilador'),
        line(1, 'loan-b', '0000029', 'Aire acondicionado'),
      ]),
    ).toEqual([
      ['1', 'Cuota N° 2 · Factura 001-001-0000018 · Ventilador'],
      ['2', 'Cuota N° 1 · Factura 001-001-0000029 · Aire acondicionado'],
    ]);
  });

  it('leaves out an invoice that does not exist yet', () => {
    expect(
      receiptItemLabels([
        line(1, 'loan-a', null, 'Ventilador'),
        line(1, 'loan-b', '0000029', 'Heladera'),
      ])[0],
    ).toEqual(['1', 'Cuota N° 1 · Ventilador']);
  });
});
