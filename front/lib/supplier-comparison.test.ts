import { describe, expect, it } from 'vitest';
import type { CatalogOffer, OfferSupplier } from './api/procurement';
import { bestQuoteId, compareSuppliers } from './supplier-comparison';

const TODAY = '2026-10-06';

function supplier(overrides: Partial<OfferSupplier> = {}): OfferSupplier {
  return {
    id: 'sup-a',
    name: 'Importadora A',
    email: null,
    paymentTermDays: 0,
    shippingCost: null,
    leadTimeDays: null,
    minOrderAmount: null,
    volumeDiscounts: [],
    ...overrides,
  };
}

function offer(overrides: Partial<CatalogOffer> = {}): CatalogOffer {
  return {
    id: 'item-1',
    supplierId: 'sup-a',
    supplierSku: 'A-1',
    description: 'Abridor',
    price: 50_000,
    supplierUnit: null,
    conversionFactor: null,
    validFrom: null,
    validTo: null,
    minOrderQuantity: null,
    availability: null,
    availabilityUpdatedAt: null,
    priceTiers: [],
    productId: 'prod-1',
    product: { id: 'prod-1', name: 'Abridor de vino', unit: 'unidad' },
    supplier: supplier(),
    ...overrides,
  };
}

const need = (quantity: number, productId = 'prod-1') => ({ productId, quantity });
const only = (needs: ReturnType<typeof need>[], offers: CatalogOffer[]) =>
  compareSuppliers(needs, offers, TODAY)[0];

describe('compareSuppliers — one line', () => {
  it('prices the quantity at the list price', () => {
    const quote = only([need(10)], [offer()]);

    expect(quote.lines[0]).toMatchObject({
      productId: 'prod-1',
      supplierQuantity: 10,
      unitPrice: 50_000,
      unitCost: 50_000,
      subtotal: 500_000,
    });
    expect(quote.total).toBe(500_000);
  });

  it('uses the price of the quantity tier reached', () => {
    const tiers = [
      { minQuantity: 10, price: 45_000 },
      { minQuantity: 50, price: 40_000 },
    ];

    expect(only([need(9)], [offer({ priceTiers: tiers })]).lines[0].unitPrice).toBe(50_000);
    expect(only([need(10)], [offer({ priceTiers: tiers })]).lines[0].unitPrice).toBe(45_000);
    expect(only([need(60)], [offer({ priceTiers: tiers })]).lines[0].unitPrice).toBe(40_000);
  });

  // El proveedor vende por caja: 30 unidades en cajas de 12 son 3 cajas, y se
  // paga y se recibe la caja entera.
  it('buys whole supplier units when the supplier sells by the pack', () => {
    const line = only(
      [need(30)],
      [offer({ price: 120_000, conversionFactor: 12, supplierUnit: 'CAJA' })],
    ).lines[0];

    expect(line.supplierQuantity).toBe(3);
    expect(line.unitsReceived).toBe(36);
    expect(line.subtotal).toBe(360_000);
    expect(line.unitCost).toBe(10_000);
  });

  it('raises the quantity to the minimum the supplier sells', () => {
    const line = only([need(2)], [offer({ minOrderQuantity: 6 })]).lines[0];

    expect(line.supplierQuantity).toBe(6);
    expect(line.raisedToMinimum).toBe(true);
    expect(line.subtotal).toBe(300_000);
  });

  it('flags an expired price and reports availability as given', () => {
    const line = only(
      [need(1)],
      [
        offer({
          validTo: '2026-09-30T00:00:00.000Z',
          availability: 'OUT_OF_STOCK',
        }),
      ],
    ).lines[0];

    expect(line.priceExpired).toBe(true);
    expect(line.availability).toBe('OUT_OF_STOCK');
  });

  it('takes the cheaper of two catalog items of the same supplier', () => {
    const quote = only(
      [need(10)],
      [
        offer({ id: 'unit', price: 50_000 }),
        offer({ id: 'pack', price: 400_000, conversionFactor: 10 }),
      ],
    );

    expect(quote.lines).toHaveLength(1);
    expect(quote.lines[0].itemId).toBe('pack');
    expect(quote.total).toBe(400_000);
  });
});

describe('compareSuppliers — the whole order', () => {
  it('applies the discount of the order-total tier reached', () => {
    const terms = supplier({
      volumeDiscounts: [
        { minAmount: 400_000, percent: 2 },
        { minAmount: 1_000_000, percent: 5 },
      ],
    });
    const quote = only([need(10)], [offer({ supplier: terms })]);

    expect(quote.subtotal).toBe(500_000);
    expect(quote.discountPercent).toBe(2);
    expect(quote.discountAmount).toBe(10_000);
    expect(quote.total).toBe(490_000);
  });

  it('adds the shipping cost after the discount', () => {
    const terms = supplier({
      shippingCost: 80_000,
      volumeDiscounts: [{ minAmount: 400_000, percent: 10 }],
    });
    const quote = only([need(10)], [offer({ supplier: terms })]);

    expect(quote.total).toBe(500_000 - 50_000 + 80_000);
  });

  // Sin dato de envío el total no lo incluye, y se avisa: no es envío gratis.
  it('does not treat an unknown shipping cost as free', () => {
    const quote = only([need(10)], [offer()]);

    expect(quote.shippingCost).toBeNull();
    expect(quote.total).toBe(500_000);
    expect(quote.notes).toContain('Sin dato de envío: el total no lo incluye');
  });

  it('checks the minimum order against the goods, before shipping', () => {
    const terms = supplier({ minOrderAmount: 600_000, shippingCost: 200_000 });
    const quote = only([need(10)], [offer({ supplier: terms })]);

    expect(quote.meetsMinimum).toBe(false);
    expect(quote.minimumShortfall).toBe(100_000);
  });

  it('marks what the supplier cannot quote', () => {
    const quote = only(
      [need(10), need(5, 'prod-2')],
      [offer(), offer({ id: 'no-price', productId: 'prod-3', price: null })],
    );

    expect(quote.missingProductIds).toEqual(['prod-2']);
    expect(quote.complete).toBe(false);
  });

  it('builds one quote per supplier, in name order', () => {
    const b = supplier({ id: 'sup-b', name: 'Distribuidora B' });
    const quotes = compareSuppliers(
      [need(10)],
      [offer(), offer({ id: 'item-b', supplierId: 'sup-b', supplier: b, price: 45_000 })],
      TODAY,
    );

    expect(quotes.map((q) => q.supplier.name)).toEqual([
      'Distribuidora B',
      'Importadora A',
    ]);
    expect(quotes.map((q) => q.total)).toEqual([450_000, 500_000]);
  });

  it('ignores lines without a product or a positive quantity', () => {
    expect(compareSuppliers([need(0), { productId: '', quantity: 5 }], [offer()], TODAY)).toEqual([]);
  });
});

describe('compareSuppliers — suppliers chosen by hand', () => {
  const central = supplier({ id: 'sup-c', name: 'Importadora Central' });

  // El otro proveedor tiene el producto en su lista pero sin vincular: se
  // muestra igual, sin cotización, para poder resolverlo desde el comparador.
  it('shows a chosen supplier that quotes nothing, with everything missing', () => {
    const quotes = compareSuppliers([need(10)], [offer()], TODAY, [central]);

    expect(quotes.map((q) => q.supplier.name)).toEqual([
      'Importadora A',
      'Importadora Central',
    ]);
    expect(quotes[1]).toMatchObject({
      lines: [],
      missingProductIds: ['prod-1'],
      complete: false,
      total: 0,
    });
  });

  it('does not repeat a chosen supplier that already quotes', () => {
    const quotes = compareSuppliers([need(10)], [offer()], TODAY, [supplier()]);

    expect(quotes).toHaveLength(1);
    expect(quotes[0].lines).toHaveLength(1);
  });

  it('never ranks an empty column as the best price', () => {
    const quotes = compareSuppliers([need(10)], [offer()], TODAY, [central]);

    expect(bestQuoteId(quotes)).toBe('sup-a');
  });
});

describe('bestQuoteId', () => {
  const quoteOf = (id: string, price: number, extra: Partial<OfferSupplier> = {}) =>
    offer({
      id: `item-${id}`,
      supplierId: id,
      price,
      supplier: supplier({ id, name: id, ...extra }),
    });

  it('picks the lowest total among the suppliers that cover everything', () => {
    const quotes = compareSuppliers(
      [need(10)],
      [quoteOf('a', 50_000), quoteOf('b', 45_000)],
      TODAY,
    );

    expect(bestQuoteId(quotes)).toBe('b');
  });

  // El más barato que no cubre el pedido o no llega al mínimo no sirve.
  it('skips a cheaper supplier that misses a product or the minimum order', () => {
    const quotes = compareSuppliers(
      [need(10)],
      [
        quoteOf('a', 50_000),
        quoteOf('b', 45_000, { minOrderAmount: 1_000_000 }),
      ],
      TODAY,
    );

    expect(bestQuoteId(quotes)).toBe('a');
  });

  it('has no winner when nobody can supply the order', () => {
    expect(bestQuoteId([])).toBeNull();
    expect(
      bestQuoteId(
        compareSuppliers(
          [need(10), need(1, 'prod-2')],
          [quoteOf('a', 50_000)],
          TODAY,
        ),
      ),
    ).toBeNull();
  });
});
