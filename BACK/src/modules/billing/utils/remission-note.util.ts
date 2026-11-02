import { UnprocessableEntityException } from '@nestjs/common';
import type { RemissionMotive } from '@prisma/client';
import { startOfBusinessDay } from '../../../common/utils/business-date.util';

// Con las palabras del art. 32, inc. 7.
export const REMISSION_MOTIVE_LABELS: Record<RemissionMotive, string> = {
  SALE: 'Venta',
  CONSIGNMENT: 'Consignación',
  EXPORT: 'Exportación',
  PURCHASE: 'Compra',
  IMPORT: 'Importación',
  RETURN: 'Devolución',
  BRANCH_TRANSFER: 'Traslado entre locales de la misma empresa',
  TRANSFORMATION: 'Traslado de bienes para transformación',
  REPAIR: 'Traslado de bienes para reparación',
  MOBILE_ISSUER: 'Traslado por emisor móvil',
  EXHIBITION: 'Exhibición, demostración',
  TRADE_FAIR: 'Participación en ferias',
  OTHER: 'Otros',
};

const toCalendarDate = (value: string) => new Date(`${value}T00:00:00.000Z`);

/**
 * Fechas de inicio y fin del traslado como días de calendario. La nota se
 * expide antes del traslado (art. 30): no puede empezar en un día pasado.
 */
export function transportDates(
  start: string,
  end: string,
  now: Date,
): { start: Date; end: Date } {
  const from = toCalendarDate(start.slice(0, 10));
  const to = toCalendarDate(end.slice(0, 10));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new UnprocessableEntityException(
      'Las fechas del traslado no son válidas',
    );
  }
  if (from < startOfBusinessDay(now)) {
    throw new UnprocessableEntityException(
      'El traslado no puede empezar antes de hoy: la nota se emite antes de que salga la mercadería',
    );
  }
  if (to < from) {
    throw new UnprocessableEntityException(
      'El traslado no puede terminar antes de empezar',
    );
  }
  return { start: from, end: to };
}

/** Descripción con marca y modelo, para identificar la mercadería (art. 33, inc. 6). */
export function goodsDescription(product: {
  name: string;
  model: string | null;
  brand: { name: string } | null;
}): string {
  const extra = [product.brand?.name, product.model]
    .filter((part): part is string => Boolean(part?.trim()))
    .filter((part) => !product.name.toLowerCase().includes(part.toLowerCase()));
  return [product.name, ...extra].join(' ');
}

export interface RemitableSource {
  invoiceItemId: string;
  quantity: number;
  saleOrderItemId: string | null;
}

export interface SaleItemForRemission {
  id: string;
  productId: string | null;
  product: {
    name: string;
    model: string | null;
    unit: string;
    isSerialized: boolean;
    brand: { name: string } | null;
  } | null;
}

export interface RemitableItem {
  invoiceItemId: string;
  productId: string;
  description: string;
  unit: string;
  quantity: number;
  remitted: number;
  remitable: number;
  isSerialized: boolean;
  soldSerials: string[];
}

/**
 * Lo que todavía se puede enviar de cada ítem de la factura: solo mercadería
 * (un servicio no se traslada) y lo que no salió ya en otra nota.
 */
export function remitableItems(
  items: RemitableSource[],
  saleItems: SaleItemForRemission[],
  remitted: Map<string, number>,
  soldSerials: Map<string, string[]>,
): RemitableItem[] {
  const bySaleItem = new Map(saleItems.map((s) => [s.id, s]));
  return items.flatMap((item) => {
    const sale = item.saleOrderItemId
      ? bySaleItem.get(item.saleOrderItemId)
      : undefined;
    if (!sale?.productId || !sale.product) return [];
    const already = remitted.get(item.invoiceItemId) ?? 0;
    return [
      {
        invoiceItemId: item.invoiceItemId,
        productId: sale.productId,
        description: goodsDescription(sale.product),
        unit: sale.product.unit,
        quantity: item.quantity,
        remitted: already,
        remitable: Math.max(item.quantity - already, 0),
        isSerialized: sale.product.isSerialized,
        soldSerials: soldSerials.get(sale.id) ?? [],
      },
    ];
  });
}

export interface RemissionLine {
  productId: string;
  invoiceItemId: string | null;
  description: string;
  unit: string;
  quantity: number;
  serialNumbers: string[];
}

function assertSerials(
  description: string,
  quantity: number,
  serials: string[],
  allowed: string[] | null,
) {
  const unique = new Set(serials.map((s) => s.trim()).filter(Boolean));
  if (unique.size !== serials.length || unique.size !== quantity) {
    throw new UnprocessableEntityException(
      `Elegí un número de serie distinto por cada unidad de "${description}"`,
    );
  }
  if (allowed && [...unique].some((s) => !allowed.includes(s))) {
    throw new UnprocessableEntityException(
      `Algún número de serie no corresponde a "${description}" de esta factura`,
    );
  }
}

/** Ítems de una nota por venta, validados contra lo que queda por enviar. */
export function buildSaleLines(
  requested: {
    invoiceItemId: string;
    quantity: number;
    serialNumbers?: string[];
  }[],
  available: RemitableItem[],
): RemissionLine[] {
  const seen = new Set<string>();
  return requested.map((req) => {
    const item = available.find((i) => i.invoiceItemId === req.invoiceItemId);
    if (!item) {
      throw new UnprocessableEntityException(
        'Uno de los ítems no es mercadería de esta factura',
      );
    }
    if (seen.has(req.invoiceItemId)) {
      throw new UnprocessableEntityException(
        `"${item.description}" está repetido`,
      );
    }
    seen.add(req.invoiceItemId);
    if (req.quantity > item.remitable) {
      throw new UnprocessableEntityException(
        item.remitable === 0
          ? `"${item.description}" ya se envió completo en otra nota de remisión`
          : `De "${item.description}" quedan ${item.remitable} unidades por enviar`,
      );
    }
    const serials = req.serialNumbers ?? [];
    if (item.isSerialized) {
      assertSerials(item.description, req.quantity, serials, item.soldSerials);
    } else if (serials.length > 0) {
      throw new UnprocessableEntityException(
        `"${item.description}" no se controla por número de serie`,
      );
    }
    return {
      productId: item.productId,
      invoiceItemId: item.invoiceItemId,
      description: item.description,
      unit: item.unit,
      quantity: req.quantity,
      serialNumbers: serials.map((s) => s.trim()),
    };
  });
}

export interface ProductForTransfer {
  id: string;
  name: string;
  model: string | null;
  unit: string;
  isSerialized: boolean;
  brand: { name: string } | null;
}

/** Ítems de un traslado entre depósitos. El stock lo valida Inventario. */
export function buildTransferLines(
  requested: {
    productId: string;
    quantity: number;
    serialNumbers?: string[];
  }[],
  products: ProductForTransfer[],
): RemissionLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const seen = new Set<string>();
  return requested.map((req) => {
    const product = byId.get(req.productId);
    if (!product) {
      throw new UnprocessableEntityException('Uno de los productos no existe');
    }
    const description = goodsDescription(product);
    if (seen.has(req.productId)) {
      throw new UnprocessableEntityException(`"${description}" está repetido`);
    }
    seen.add(req.productId);
    const serials = req.serialNumbers ?? [];
    if (product.isSerialized) {
      assertSerials(description, req.quantity, serials, null);
    } else if (serials.length > 0) {
      throw new UnprocessableEntityException(
        `"${description}" no se controla por número de serie`,
      );
    }
    return {
      productId: product.id,
      invoiceItemId: null,
      description,
      unit: product.unit,
      quantity: req.quantity,
      serialNumbers: serials.map((s) => s.trim()),
    };
  });
}
