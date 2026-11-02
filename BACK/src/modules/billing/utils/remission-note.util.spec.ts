import {
  buildSaleLines,
  buildTransferLines,
  goodsDescription,
  remitableItems,
  transportDates,
} from './remission-note.util';

// 03/11/2026 10:00 en Asunción.
const NOW = new Date('2026-11-03T13:00:00.000Z');

describe('transportDates', () => {
  it('keeps calendar days', () => {
    expect(transportDates('2026-11-03', '2026-11-04', NOW)).toEqual({
      start: new Date('2026-11-03T00:00:00.000Z'),
      end: new Date('2026-11-04T00:00:00.000Z'),
    });
  });

  it('uses the business day, not the UTC one', () => {
    // 02/11 23:30 en Asunción ya es 03/11 en UTC.
    const lateNight = new Date('2026-11-03T02:30:00.000Z');
    expect(() =>
      transportDates('2026-11-02', '2026-11-02', lateNight),
    ).not.toThrow();
  });

  it.each([
    ['2026-11-02', '2026-11-03', 'antes de hoy'],
    ['2026-11-05', '2026-11-04', 'terminar antes de empezar'],
  ])('rejects %s → %s', (start, end, message) => {
    expect(() => transportDates(start, end, NOW)).toThrow(message);
  });
});

describe('goodsDescription', () => {
  it('adds brand and model unless the name already has them', () => {
    expect(
      goodsDescription({
        name: 'Heladera',
        model: 'RT38',
        brand: { name: 'SAMSUNG' },
      }),
    ).toBe('Heladera SAMSUNG RT38');
    expect(
      goodsDescription({
        name: 'Heladera Samsung RT38',
        model: 'RT38',
        brand: { name: 'SAMSUNG' },
      }),
    ).toBe('Heladera Samsung RT38');
    expect(goodsDescription({ name: 'Arroz', model: null, brand: null })).toBe(
      'Arroz',
    );
  });
});

const SALE_ITEMS = [
  {
    id: 'soi-tv',
    productId: 'p-tv',
    product: {
      name: 'Televisor',
      model: null,
      unit: 'unidad',
      isSerialized: true,
      brand: { name: 'LG' },
    },
  },
  {
    id: 'soi-rice',
    productId: 'p-rice',
    product: {
      name: 'Arroz',
      model: null,
      unit: 'kg',
      isSerialized: false,
      brand: null,
    },
  },
  { id: 'soi-install', productId: null, product: null },
];

const INVOICE_ITEMS = [
  { invoiceItemId: 'ii-tv', quantity: 2, saleOrderItemId: 'soi-tv' },
  { invoiceItemId: 'ii-rice', quantity: 10, saleOrderItemId: 'soi-rice' },
  { invoiceItemId: 'ii-install', quantity: 1, saleOrderItemId: 'soi-install' },
  { invoiceItemId: 'ii-old', quantity: 1, saleOrderItemId: null },
];

describe('remitableItems', () => {
  it('lists only goods, with what is left to send', () => {
    const items = remitableItems(
      INVOICE_ITEMS,
      SALE_ITEMS,
      new Map([['ii-rice', 4]]),
      new Map([['soi-tv', ['SN-1', 'SN-2']]]),
    );
    expect(items).toEqual([
      expect.objectContaining({
        invoiceItemId: 'ii-tv',
        description: 'Televisor LG',
        remitable: 2,
        isSerialized: true,
        soldSerials: ['SN-1', 'SN-2'],
      }),
      expect.objectContaining({
        invoiceItemId: 'ii-rice',
        unit: 'kg',
        remitted: 4,
        remitable: 6,
      }),
    ]);
  });
});

describe('serial numbers already sent', () => {
  it('does not offer a serial number that left in another note', () => {
    const [tv] = remitableItems(
      INVOICE_ITEMS,
      SALE_ITEMS,
      new Map([['ii-tv', 1]]),
      new Map([['soi-tv', ['SN-1', 'SN-2']]]),
      new Map([['ii-tv', ['SN-1']]]),
    );
    expect(tv.soldSerials).toEqual(['SN-2']);
    expect(() =>
      buildSaleLines(
        [{ invoiceItemId: 'ii-tv', quantity: 1, serialNumbers: ['SN-1'] }],
        [tv],
      ),
    ).toThrow('no corresponde');
  });
});

describe('buildSaleLines', () => {
  const available = remitableItems(
    INVOICE_ITEMS,
    SALE_ITEMS,
    new Map([['ii-rice', 4]]),
    new Map([['soi-tv', ['SN-1', 'SN-2']]]),
  );

  it('builds the lines with their serial numbers', () => {
    expect(
      buildSaleLines(
        [
          { invoiceItemId: 'ii-tv', quantity: 1, serialNumbers: ['SN-2'] },
          { invoiceItemId: 'ii-rice', quantity: 6 },
        ],
        available,
      ),
    ).toEqual([
      {
        productId: 'p-tv',
        invoiceItemId: 'ii-tv',
        description: 'Televisor LG',
        unit: 'unidad',
        quantity: 1,
        serialNumbers: ['SN-2'],
      },
      expect.objectContaining({
        invoiceItemId: 'ii-rice',
        quantity: 6,
        serialNumbers: [],
      }),
    ]);
  });

  it.each([
    [[{ invoiceItemId: 'ii-install', quantity: 1 }], 'no es mercadería'],
    [[{ invoiceItemId: 'ii-rice', quantity: 7 }], 'quedan 6 unidades'],
    [
      [
        { invoiceItemId: 'ii-rice', quantity: 1 },
        { invoiceItemId: 'ii-rice', quantity: 1 },
      ],
      'repetido',
    ],
    [
      [{ invoiceItemId: 'ii-tv', quantity: 2, serialNumbers: ['SN-1'] }],
      'por cada unidad',
    ],
    [
      [{ invoiceItemId: 'ii-tv', quantity: 1, serialNumbers: ['SN-9'] }],
      'no corresponde',
    ],
    [
      [{ invoiceItemId: 'ii-rice', quantity: 1, serialNumbers: ['X'] }],
      'no se controla por número de serie',
    ],
  ])('rejects %j', (requested, message) => {
    expect(() => buildSaleLines(requested, available)).toThrow(message);
  });

  it('says when an item already went out complete', () => {
    const sent = remitableItems(
      INVOICE_ITEMS,
      SALE_ITEMS,
      new Map([['ii-rice', 10]]),
      new Map(),
    );
    expect(() =>
      buildSaleLines([{ invoiceItemId: 'ii-rice', quantity: 1 }], sent),
    ).toThrow('ya se envió completo');
  });
});

describe('buildTransferLines', () => {
  const products = [
    {
      id: 'p-tv',
      name: 'Televisor',
      model: 'X1',
      unit: 'unidad',
      isSerialized: true,
      brand: null,
    },
    {
      id: 'p-rice',
      name: 'Arroz',
      model: null,
      unit: 'kg',
      isSerialized: false,
      brand: null,
    },
  ];

  it('builds the lines of the transfer', () => {
    expect(
      buildTransferLines(
        [
          { productId: 'p-tv', quantity: 1, serialNumbers: [' SN-1 '] },
          { productId: 'p-rice', quantity: 3 },
        ],
        products,
      ),
    ).toEqual([
      expect.objectContaining({
        productId: 'p-tv',
        description: 'Televisor X1',
        serialNumbers: ['SN-1'],
      }),
      expect.objectContaining({
        productId: 'p-rice',
        unit: 'kg',
        invoiceItemId: null,
      }),
    ]);
  });

  it.each([
    [[{ productId: 'p-gone', quantity: 1 }], 'no existe'],
    [
      [{ productId: 'p-tv', quantity: 2, serialNumbers: ['SN-1'] }],
      'por cada unidad',
    ],
    [
      [
        { productId: 'p-rice', quantity: 1 },
        { productId: 'p-rice', quantity: 2 },
      ],
      'repetido',
    ],
  ])('rejects %j', (requested, message) => {
    expect(() => buildTransferLines(requested, products)).toThrow(message);
  });
});
