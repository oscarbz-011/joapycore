import { describe, expect, it } from 'vitest';
import {
  newProductPayload,
  orderPayload,
  orderPlan,
  staysDraft,
} from './compare-order';
import type { QuoteLine, SupplierQuote } from './supplier-comparison';

function line(overrides: Partial<QuoteLine> = {}): QuoteLine {
  return {
    productId: 'row-1',
    itemId: 'a-1',
    linkedProductId: null,
    description: 'ABRIDOR DE VINO',
    supplierSku: 'A-1',
    supplierQuantity: 3,
    supplierUnit: 'CAJA',
    unitsReceived: 36,
    unitPrice: 120_000,
    unitCost: 10_000,
    subtotal: 360_000,
    raisedToMinimum: false,
    priceExpired: false,
    availability: null,
    availabilityUpdatedAt: null,
    ...overrides,
  };
}

function quote(supplierId: string, lines: QuoteLine[]): SupplierQuote {
  return {
    supplier: {
      id: supplierId,
      name: supplierId,
      email: null,
      paymentTermDays: 0,
      advancePercent: null,
      shippingCost: null,
      leadTimeDays: null,
      minOrderAmount: null,
      volumeDiscounts: [],
      quantityDiscounts: [],
    },
    lines,
    missingProductIds: [],
    complete: true,
    subtotal: 0,
    discountPercent: 0,
    discountAmount: 0,
    discountBasis: null,
    totalUnits: 0,
    shippingCost: null,
    total: 0,
    meetsMinimum: null,
    minimumShortfall: 0,
    notes: [],
  };
}

describe('orderPlan', () => {
  it('orders in internal units at the unit cost', () => {
    const chosen = quote('sup-a', [line({ linkedProductId: 'prod-1' })]);

    expect(orderPlan(chosen, [chosen]).lines).toEqual([
      {
        rowKey: 'row-1',
        itemId: 'a-1',
        description: 'ABRIDOR DE VINO',
        supplierSku: 'A-1',
        quantity: 36,
        unitCost: 10_000,
        productId: 'prod-1',
      },
    ]);
  });

  it('needs no new product when every item is already linked', () => {
    const chosen = quote('sup-a', [line({ linkedProductId: 'prod-1' })]);

    expect(orderPlan(chosen, [chosen]).newProducts).toEqual([]);
  });

  // La lista recién cargada: el ítem no tiene producto. Se crea uno, y el ítem
  // equivalente del otro proveedor queda vinculado al mismo, para no tener que
  // emparejarlos otra vez.
  it('plans a new product and remembers the equivalent items of other suppliers', () => {
    const chosen = quote('sup-a', [line()]);
    const other = quote('sup-c', [line({ itemId: 'c-1', unitCost: 12_000 })]);

    const plan = orderPlan(chosen, [chosen, other]);

    expect(plan.lines[0].productId).toBeNull();
    expect(plan.newProducts).toEqual([
      {
        rowKey: 'row-1',
        itemId: 'a-1',
        name: 'ABRIDOR DE VINO',
        costPrice: 10_000,
        siblingItemIds: ['c-1'],
      },
    ]);
  });

  // Si el otro proveedor ya lo tiene vinculado, el producto existe: se usa ese
  // en vez de crear un duplicado.
  it('reuses the product another supplier already has for that row', () => {
    const chosen = quote('sup-a', [line()]);
    const other = quote('sup-c', [
      line({ itemId: 'c-1', linkedProductId: 'prod-7' }),
    ]);

    const plan = orderPlan(chosen, [chosen, other]);

    expect(plan.newProducts).toEqual([]);
    expect(plan.lines[0].productId).toBe('prod-7');
    expect(plan.links).toEqual([{ itemId: 'a-1', productId: 'prod-7' }]);
  });

  it('does not touch items of other suppliers that are already linked', () => {
    const chosen = quote('sup-a', [line()]);
    const other = quote('sup-c', [
      line({ itemId: 'c-1', productId: 'row-2', linkedProductId: 'prod-7' }),
    ]);

    expect(orderPlan(chosen, [chosen, other]).newProducts[0].siblingItemIds).toEqual(
      [],
    );
  });
});

describe('new product from the comparison', () => {
  const draft = {
    rowKey: 'row-1',
    itemId: 'a-1',
    name: 'ABRIDOR DE VINO',
    costPrice: 10_000,
    siblingItemIds: [],
  };

  it('is complete with a category and a sale price', () => {
    const form = { name: ' Abridor de vino ', categoryId: 'cat-1', salePrice: 15_000 };

    expect(staysDraft(form)).toBe(false);
    expect(newProductPayload(draft, form)).toEqual({
      name: 'Abridor de vino',
      categoryId: 'cat-1',
      costPrice: 10_000,
      salePrice: 15_000,
      isSerialized: false,
      isPurchasable: true,
      sellOnFirstReceipt: true,
    });
  });

  // Se puede decidir la compra sin terminar la ficha: queda en borrador y se
  // completa antes de recibir la mercadería.
  it('stays a draft without a category or a sale price', () => {
    const form = { name: 'Abridor', categoryId: '', salePrice: 0 };
    const payload = newProductPayload(draft, form);

    expect(staysDraft(form)).toBe(true);
    expect(payload).not.toHaveProperty('categoryId');
    expect(payload).not.toHaveProperty('salePrice');
    expect(payload.costPrice).toBe(10_000);
  });
});

describe('orderPayload', () => {
  it('builds the purchase order with each line tied to its catalog item', () => {
    expect(
      orderPayload('sup-a', '2026-10-06', [
        { itemId: 'a-1', productId: 'prod-1', quantity: 36, unitCost: 10_000 },
      ]),
    ).toEqual({
      supplierId: 'sup-a',
      purchaseType: 'LOCAL',
      orderDate: '2026-10-06',
      items: [
        {
          productId: 'prod-1',
          quantity: 36,
          unitCost: 10_000,
          catalogItemId: 'a-1',
        },
      ],
    });
  });

  it('joins two lines that ended up on the same product', () => {
    const payload = orderPayload('sup-a', '2026-10-06', [
      { itemId: 'a-1', productId: 'prod-1', quantity: 10, unitCost: 10_000 },
      { itemId: 'a-2', productId: 'prod-1', quantity: 5, unitCost: 10_000 },
    ]);

    expect(payload.items).toEqual([
      {
        productId: 'prod-1',
        quantity: 15,
        unitCost: 10_000,
        catalogItemId: 'a-1',
      },
    ]);
  });
});
