import type { CatalogOffer, OfferSupplier } from './api/procurement';
import { priceValidity } from './catalog-validity';
import type { SupplierAvailability } from './commercial-terms';

/**
 * Lo que se quiere comprar y cuántas unidades. Puede ser un producto interno
 * (lo cotizan los ítems vinculados a él) o algo que todavía no existe como
 * producto: en ese caso `itemIds` dice qué ítem de cada catálogo lo representa.
 */
export interface Need {
  /** Identifica la fila: el id del producto, o una clave propia de la búsqueda. */
  productId: string;
  quantity: number;
  /** Ítems de catálogo elegidos para esta fila, uno por proveedor. */
  itemIds?: readonly string[];
}

export interface QuoteLine {
  /** La fila (`Need.productId`) que esta línea cotiza. */
  productId: string;
  itemId: string;
  /** Producto interno del ítem; null si todavía no está vinculado. */
  linkedProductId: string | null;
  description: string;
  supplierSku: string;
  /** Cuánto se le pide al proveedor, en su unidad (cajas, bultos...). */
  supplierQuantity: number;
  supplierUnit: string | null;
  /** Unidades internas que llegan: puede ser más de lo pedido. */
  unitsReceived: number;
  /** Precio por unidad del proveedor, con el tramo por cantidad aplicado. */
  unitPrice: number;
  /** Costo por unidad interna. */
  unitCost: number;
  subtotal: number;
  /** Se subió la cantidad para llegar al mínimo que vende el proveedor. */
  raisedToMinimum: boolean;
  priceExpired: boolean;
  availability: SupplierAvailability | null;
  availabilityUpdatedAt: string | null;
}

export interface SupplierQuote {
  supplier: OfferSupplier;
  lines: QuoteLine[];
  /** Productos pedidos que este proveedor no cotiza. */
  missingProductIds: string[];
  /** Cotiza todo lo pedido. */
  complete: boolean;
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  /** null = sin dato: el total no lo incluye. */
  shippingCost: number | null;
  total: number;
  /** null = el proveedor no informó un pedido mínimo. */
  meetsMinimum: boolean | null;
  minimumShortfall: number;
  /** Avisos para leer junto al total. */
  notes: string[];
}

function quoteLine(
  need: Need,
  item: CatalogOffer,
  todayISO: string,
): QuoteLine | null {
  if (item.price === null) return null;
  const factor =
    item.conversionFactor && item.conversionFactor > 0
      ? item.conversionFactor
      : 1;
  const needed = Math.ceil(need.quantity / factor);
  const supplierQuantity = Math.max(needed, item.minOrderQuantity ?? 1);

  // Los tramos vienen ordenados por cantidad: rige el último que se alcanza.
  const unitPrice = item.priceTiers.reduce(
    (price, tier) => (supplierQuantity >= tier.minQuantity ? tier.price : price),
    item.price,
  );

  return {
    productId: need.productId,
    itemId: item.id,
    linkedProductId: item.productId,
    description: item.description,
    supplierSku: item.supplierSku,
    supplierQuantity,
    supplierUnit: item.supplierUnit,
    unitsReceived: supplierQuantity * factor,
    unitPrice,
    unitCost: Math.round((unitPrice / factor) * 100) / 100,
    subtotal: supplierQuantity * unitPrice,
    raisedToMinimum: supplierQuantity > needed,
    priceExpired: priceValidity(item, todayISO).status === 'expired',
    availability: item.availability,
    availabilityUpdatedAt: item.availabilityUpdatedAt,
  };
}

function supplierQuote(
  supplier: OfferSupplier,
  needs: readonly Need[],
  items: readonly CatalogOffer[],
  todayISO: string,
): SupplierQuote {
  const lines: QuoteLine[] = [];
  const missingProductIds: string[] = [];

  for (const need of needs) {
    // Un proveedor puede tener el mismo producto en dos presentaciones: se
    // toma la que sale más barata para esa cantidad.
    const candidates = items
      .filter((item) =>
        need.itemIds
          ? need.itemIds.includes(item.id)
          : item.productId === need.productId,
      )
      .flatMap((item) => quoteLine(need, item, todayISO) ?? [])
      .sort((a, b) => a.subtotal - b.subtotal);
    if (candidates[0]) lines.push(candidates[0]);
    else missingProductIds.push(need.productId);
  }

  const subtotal = lines.reduce((sum, line) => sum + line.subtotal, 0);
  const discountPercent = supplier.volumeDiscounts.reduce(
    (percent, tier) => (subtotal >= tier.minAmount ? tier.percent : percent),
    0,
  );
  const discountAmount = Math.round((subtotal * discountPercent) / 100);
  const goods = subtotal - discountAmount;

  // El pedido mínimo se mide sobre la mercadería, antes del envío.
  const minimum = supplier.minOrderAmount;
  const meetsMinimum = minimum === null ? null : goods >= minimum;

  const notes: string[] = [];
  if (supplier.shippingCost === null) {
    notes.push('Sin dato de envío: el total no lo incluye');
  }
  if (lines.some((line) => line.priceExpired)) {
    notes.push('Tiene precios de lista vencidos');
  }
  if (lines.some((line) => line.raisedToMinimum)) {
    notes.push('Hay cantidades subidas al mínimo que vende');
  }

  return {
    supplier,
    lines,
    missingProductIds,
    complete: missingProductIds.length === 0,
    subtotal,
    discountPercent,
    discountAmount,
    shippingCost: supplier.shippingCost,
    total: goods + (supplier.shippingCost ?? 0),
    meetsMinimum,
    minimumShortfall:
      minimum !== null && goods < minimum ? minimum - goods : 0,
    notes,
  };
}

/**
 * Una cotización por proveedor para lo que se quiere comprar: precio con
 * descuentos por cantidad y por total, envío, mínimos y disponibilidad.
 * Sirve igual para reponer un solo producto que para una lista.
 */
export function compareSuppliers(
  needs: readonly Need[],
  offers: readonly CatalogOffer[],
  todayISO: string,
  /**
   * Proveedores que se quieren ver aunque no coticen nada: su columna dice
   * qué les falta (típicamente, vincular su ítem al producto).
   */
  alsoShow: readonly OfferSupplier[] = [],
): SupplierQuote[] {
  const wanted = needs.filter(
    (need) =>
      need.productId &&
      need.quantity > 0 &&
      // Una búsqueda sin ningún ítem elegido todavía no es una fila.
      (!need.itemIds || need.itemIds.length > 0),
  );
  if (wanted.length === 0) return [];

  const bySupplier = new Map<string, CatalogOffer[]>();
  for (const offer of offers) {
    bySupplier.set(offer.supplier.id, [
      ...(bySupplier.get(offer.supplier.id) ?? []),
      offer,
    ]);
  }

  const quoted = [...bySupplier.values()]
    .map((items) => supplierQuote(items[0].supplier, wanted, items, todayISO))
    .filter((quote) => quote.lines.length > 0);
  const quotedIds = new Set(quoted.map((quote) => quote.supplier.id));
  const empty = alsoShow
    .filter((supplier) => !quotedIds.has(supplier.id))
    .map((supplier) => supplierQuote(supplier, wanted, [], todayISO));

  return [...quoted, ...empty].sort((a, b) =>
    a.supplier.name.localeCompare(b.supplier.name, 'es'),
  );
}

/**
 * El proveedor más conveniente por precio: el menor total entre los que
 * cotizan todo y llegan a su pedido mínimo. null si ninguno puede.
 */
export function bestQuoteId(quotes: readonly SupplierQuote[]): string | null {
  const able = quotes.filter(
    (quote) => quote.complete && quote.meetsMinimum !== false,
  );
  if (able.length === 0) return null;
  return able.reduce((best, quote) => (quote.total < best.total ? quote : best))
    .supplier.id;
}

/** Cómo queda un precio frente a los de los otros proveedores. */
export interface PriceGap {
  /** `cheaper`: más barato que el más caro. `highest`: es el más caro. */
  kind: 'cheaper' | 'highest' | 'same';
  /** Cuánto más barato que el más caro, en porcentaje con un decimal. */
  percent: number;
}

const oneDecimal = (n: number) => Math.round(n * 10) / 10;

/**
 * Diferencia porcentual de cada precio, siempre contra la misma referencia:
 * el más caro. Así todos los porcentajes se leen igual ("10% más barato") y
 * no hay dos números distintos para la misma diferencia, como pasaría
 * midiendo uno hacia arriba y otro hacia abajo.
 * null donde no hay precio o no hay con qué comparar.
 */
export function priceGaps(
  prices: readonly (number | null)[],
): (PriceGap | null)[] {
  const known = prices.filter((price): price is number => price !== null && price > 0);
  if (known.length < 2) return prices.map(() => null);

  const highest = Math.max(...known);
  const allEqual = known.every((price) => price === highest);

  return prices.map((price) => {
    if (price === null || price <= 0) return null;
    if (allEqual) return { kind: 'same', percent: 0 };
    if (price === highest) return { kind: 'highest', percent: 0 };
    return {
      kind: 'cheaper',
      percent: oneDecimal(((highest - price) / highest) * 100),
    };
  });
}

export function priceGapLabel(gap: PriceGap): string {
  if (gap.kind === 'same') return 'Mismo precio';
  if (gap.kind === 'highest') return 'El más caro';
  const percent = new Intl.NumberFormat('es-PY', { maximumFractionDigits: 1 }).format(
    gap.percent,
  );
  return `${percent}% más barato`;
}
