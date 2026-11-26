import { Prisma } from '@prisma/client';
import {
  buildCreditLines,
  creditableItems,
  splitAgainstBalance,
  type InvoiceItemForCredit,
} from './credit-note.util';

const items: InvoiceItemForCredit[] = [
  {
    id: 'ii-1',
    description: 'Heladera',
    quantity: 2,
    unitPrice: 1_100_000,
    total: 2_200_000,
    ivaRate: 10,
    saleOrderItemId: 'soi-1',
  },
  {
    id: 'ii-2',
    description: 'Arroz',
    quantity: 3,
    unitPrice: 10_500,
    total: 31_500,
    ivaRate: 5,
    saleOrderItemId: 'soi-2',
  },
];

describe('creditableItems', () => {
  it('keeps the invoiced price on a cash sale and subtracts what was already credited', () => {
    const result = creditableItems(2_231_500, items, new Map([['ii-2', 1]]));
    expect(result[0]).toMatchObject({
      unitPrice: 1_100_000,
      creditableQuantity: new Prisma.Decimal(2),
    });
    expect(result[1]).toMatchObject({
      unitPrice: 10_500,
      creditableQuantity: new Prisma.Decimal(2),
    });
  });

  it('spreads the financed total over the items on a credit sale', () => {
    const [heladera] = creditableItems(2_640_000, items.slice(0, 1), new Map());
    expect(heladera.unitPrice).toBe(1_320_000);
  });
});

describe('buildCreditLines', () => {
  const available = creditableItems(2_231_500, items, new Map());

  it('credits every item for a total note', () => {
    const { lines, total } = buildCreditLines(
      { kind: 'TOTAL', reason: 'Se anula la venta' },
      available,
      2_231_500,
    );
    expect(total).toBe(2_231_500);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({
      quantity: 2,
      ivaRate: 10,
      ivaAmount: 200_000,
    });
  });

  it('absorbs the rounding of the financed proration in the last line', () => {
    const financed = creditableItems(1_000_000, items, new Map());
    const { total } = buildCreditLines(
      { kind: 'TOTAL', reason: 'Se anula' },
      financed,
      1_000_000,
    );
    expect(total).toBe(1_000_000);
  });

  it('rejects a total note once part of the invoice was credited', () => {
    const partial = creditableItems(2_231_500, items, new Map([['ii-1', 1]]));
    expect(() =>
      buildCreditLines({ kind: 'TOTAL', reason: 'x' }, partial, 1_131_500),
    ).toThrow('acreditá lo que queda por ítems o por importe');
  });

  it('credits the chosen quantities of an item', () => {
    const { lines, total } = buildCreditLines(
      {
        kind: 'ITEMS',
        reason: 'Devolución',
        items: [{ invoiceItemId: 'ii-1', quantity: 1 }],
      },
      available,
      2_231_500,
    );
    expect(total).toBe(1_100_000);
    expect(lines[0]).toMatchObject({
      invoiceItemId: 'ii-1',
      quantity: 1,
      ivaAmount: 100_000,
    });
  });

  it.each([
    [[{ invoiceItemId: 'ii-1', quantity: 3 }], 'se pueden acreditar hasta 2'],
    [[{ invoiceItemId: 'otro', quantity: 1 }], 'no es de esta factura'],
    [
      [
        { invoiceItemId: 'ii-2', quantity: 1 },
        { invoiceItemId: 'ii-2', quantity: 1 },
      ],
      'está repetido',
    ],
    [[], 'al menos un ítem'],
  ])('rejects item request %j', (requested, message) => {
    expect(() =>
      buildCreditLines(
        { kind: 'ITEMS', reason: 'x', items: requested },
        available,
        2_231_500,
      ),
    ).toThrow(message);
  });

  it('credits an amount with its IVA rate as a discount', () => {
    const { lines, total } = buildCreditLines(
      {
        kind: 'AMOUNT',
        reason: 'Pago anticipado',
        amount: 110_000,
        ivaRate: 10,
      },
      available,
      2_231_500,
    );
    expect(total).toBe(110_000);
    expect(lines[0]).toMatchObject({
      invoiceItemId: null,
      description: 'Descuento o bonificación: Pago anticipado',
      ivaAmount: 10_000,
    });
  });

  it('never credits more than what is left of the invoice', () => {
    expect(() =>
      buildCreditLines(
        { kind: 'AMOUNT', reason: 'x', amount: 600_000, ivaRate: 10 },
        available,
        500_000,
      ),
    ).toThrow('supera lo que queda por acreditar');
  });

  it('rejects an invoice already fully credited', () => {
    expect(() =>
      buildCreditLines(
        { kind: 'AMOUNT', reason: 'x', amount: 1 },
        available,
        0,
      ),
    ).toThrow('ya está acreditada por completo');
  });

  it('rejects an IVA rate that does not exist', () => {
    expect(() =>
      buildCreditLines(
        { kind: 'AMOUNT', reason: 'x', amount: 1000, ivaRate: 7 },
        available,
        2_231_500,
      ),
    ).toThrow('exenta, 5 % o 10 %');
  });
});

describe('credit notes on an invoice from before the exact amounts', () => {
  // Factura a crédito vieja: 3 unidades de 333.333 prorrateadas sobre un
  // total con centavos. Cada precio redondeado a guaraníes se pasa por poco.
  const legacy: InvoiceItemForCredit[] = [
    {
      id: 'ii-1',
      description: 'Silla',
      quantity: 3,
      unitPrice: 333_333,
      total: 999_999,
      ivaRate: 10,
      saleOrderItemId: 'soi-1',
    },
  ];

  it('credits every item in full without exceeding what is left', () => {
    const available = creditableItems('1000000.80', legacy, new Map());
    // 333.333 × 1,0000018 = 333.333,6 → 333.334; × 3 = 1.000.002
    const { total, lines } = buildCreditLines(
      {
        kind: 'ITEMS',
        reason: 'Devolución',
        items: [{ invoiceItemId: 'ii-1', quantity: 3 }],
      },
      available,
      1000000.8,
    );
    expect(total).toBe(1000000.8);
    expect(lines[0].total).toBe(1000000.8);
  });

  it('credits the exact remainder by amount', () => {
    const { total } = buildCreditLines(
      { kind: 'AMOUNT', reason: 'Ajuste', amount: 1000.5 },
      [],
      1000.5,
    );
    expect(total).toBe(1000.5);
  });
});

describe('splitAgainstBalance', () => {
  it.each([
    [500_000, 2_000_000, 500_000, 0],
    [500_000, 200_000, 200_000, 300_000],
    [500_000, 0, 0, 500_000],
  ])(
    'credit %i with %i owed applies %i and leaves %i',
    (total, owed, applied, excess) => {
      expect(splitAgainstBalance(total, owed)).toEqual({ applied, excess });
    },
  );
});
