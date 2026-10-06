import {
  compareInvoice,
  invoiceDueDate,
  payableAfterInvoice,
  requiresApproval,
  type InvoicedLine,
  type ReceivedLine,
} from './supplier-invoice.util';

// Recepción 1 (cuenta ap-1): 10 × 100.000 y 5 × 40.000 = 1.200.000
// Recepción 2 (cuenta ap-2): 4 × 100.000 = 400.000
const received: ReceivedLine[] = [
  { receiptItemId: 'ri-1', payableId: 'ap-1', quantity: 10, unitCost: 100_000 },
  { receiptItemId: 'ri-2', payableId: 'ap-1', quantity: 5, unitCost: 40_000 },
  { receiptItemId: 'ri-3', payableId: 'ap-2', quantity: 4, unitCost: 100_000 },
];
const asReceived: InvoicedLine[] = received.map(
  ({ receiptItemId, quantity, unitCost }) => ({
    receiptItemId,
    quantity,
    unitCost,
  }),
);
const compare = (
  invoiced: InvoicedLine[] = asReceived,
  shipping = 0,
  discount = 0,
) => compareInvoice({ received, invoiced, shipping, discount });

describe('compareInvoice', () => {
  it('matches when the invoice says what was received', () => {
    const result = compare();

    expect(result).toEqual({
      subtotal: 1_600_000,
      total: 1_600_000,
      estimated: 1_600_000,
      difference: 0,
      differences: [],
      payables: [
        { payableId: 'ap-1', estimated: 1_200_000, amount: 1_200_000 },
        { payableId: 'ap-2', estimated: 400_000, amount: 400_000 },
      ],
    });
    expect(requiresApproval(result)).toBe(false);
  });

  it('reports a quantity that differs from what was received', () => {
    const result = compare([
      { receiptItemId: 'ri-1', quantity: 8, unitCost: 100_000 },
      asReceived[1],
      asReceived[2],
    ]);

    expect(result.differences).toEqual([
      { kind: 'quantity', receiptItemId: 'ri-1', received: 10, invoiced: 8 },
    ]);
    expect(result.difference).toBe(-200_000);
    expect(result.payables[0].amount).toBe(1_000_000);
    expect(requiresApproval(result)).toBe(true);
  });

  it('reports a price that differs from the order', () => {
    const result = compare([
      asReceived[0],
      { receiptItemId: 'ri-2', quantity: 5, unitCost: 45_000 },
      asReceived[2],
    ]);

    expect(result.differences).toEqual([
      {
        kind: 'price',
        receiptItemId: 'ri-2',
        received: 40_000,
        invoiced: 45_000,
      },
    ]);
    expect(result.difference).toBe(25_000);
  });

  // Recibido pero no facturado: no es lo mismo que facturado como se recibió.
  it('treats a received line the invoice leaves out as invoiced at zero', () => {
    const result = compare([asReceived[0], asReceived[2]]);

    expect(result.differences).toEqual([
      { kind: 'quantity', receiptItemId: 'ri-2', received: 5, invoiced: 0 },
    ]);
    expect(result.payables[0].amount).toBe(1_000_000);
  });

  // Aunque se compensen en el total, las dos diferencias existen.
  it('asks for approval even when differences cancel each other out', () => {
    const result = compare(asReceived, 50_000, 50_000);

    expect(result.difference).toBe(0);
    expect(result.differences).toEqual([
      { kind: 'shipping', amount: 50_000 },
      { kind: 'discount', amount: 50_000 },
    ]);
    expect(requiresApproval(result)).toBe(true);
  });

  it('spreads shipping and discount over the payables by what each was invoiced', () => {
    // Extra: 100.000 − 20.000 = 80.000 → 3/4 a ap-1 y 1/4 a ap-2.
    const result = compare(asReceived, 100_000, 20_000);

    expect(result.total).toBe(1_680_000);
    expect(result.payables).toEqual([
      { payableId: 'ap-1', estimated: 1_200_000, amount: 1_260_000 },
      { payableId: 'ap-2', estimated: 400_000, amount: 420_000 },
    ]);
  });

  it('never loses a cent when the split does not divide evenly', () => {
    const result = compareInvoice({
      received: [
        { receiptItemId: 'a', payableId: 'ap-1', quantity: 1, unitCost: 1 },
        { receiptItemId: 'b', payableId: 'ap-2', quantity: 1, unitCost: 1 },
        { receiptItemId: 'c', payableId: 'ap-3', quantity: 1, unitCost: 1 },
      ],
      invoiced: [
        { receiptItemId: 'a', quantity: 1, unitCost: 1 },
        { receiptItemId: 'b', quantity: 1, unitCost: 1 },
        { receiptItemId: 'c', quantity: 1, unitCost: 1 },
      ],
      shipping: 1,
      discount: 0,
    });

    const allocated = result.payables.reduce((sum, p) => sum + p.amount, 0);
    expect(Math.round(allocated * 100) / 100).toBe(result.total);
  });
});

describe('payableAfterInvoice', () => {
  it('keeps what was paid when the invoice is higher', () => {
    expect(
      payableAfterInvoice({
        amount: 1_250_000,
        paidAmount: 1_200_000,
        advanceApplied: 0,
      }),
    ).toEqual({
      paidAmount: 1_200_000,
      advanceApplied: 0,
      status: 'PARTIAL',
      releasedAdvance: 0,
      overpaid: 0,
    });
  });

  it('leaves it pending, partial or paid against the invoiced amount', () => {
    const status = (paidAmount: number) =>
      payableAfterInvoice({ amount: 1_000_000, paidAmount, advanceApplied: 0 })
        .status;
    expect(status(0)).toBe('PENDING');
    expect(status(400_000)).toBe('PARTIAL');
    expect(status(1_000_000)).toBe('PAID');
  });

  // La factura vino por menos de lo adelantado: la diferencia vuelve a la orden.
  it('gives the advance back to the order when the invoice is lower', () => {
    expect(
      payableAfterInvoice({
        amount: 900_000,
        paidAmount: 1_200_000,
        advanceApplied: 1_200_000,
      }),
    ).toEqual({
      paidAmount: 900_000,
      advanceApplied: 900_000,
      status: 'PAID',
      releasedAdvance: 300_000,
      overpaid: 0,
    });
  });

  it('reports what was overpaid with ordinary payments, which it cannot undo', () => {
    const result = payableAfterInvoice({
      amount: 900_000,
      paidAmount: 1_200_000,
      advanceApplied: 100_000,
    });

    expect(result.releasedAdvance).toBe(100_000);
    expect(result.overpaid).toBe(200_000);
  });
});

describe('invoiceDueDate', () => {
  it('counts the supplier term from the invoice date', () => {
    expect(invoiceDueDate(new Date('2026-10-07T00:00:00.000Z'), 30)).toEqual(
      new Date('2026-11-06T00:00:00.000Z'),
    );
    expect(invoiceDueDate(new Date('2026-10-07T00:00:00.000Z'), 0)).toEqual(
      new Date('2026-10-07T00:00:00.000Z'),
    );
  });
});
