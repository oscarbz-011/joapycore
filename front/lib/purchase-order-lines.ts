import type {
  CreatePurchaseOrderItem,
  SupplierCatalogItem,
} from './api/procurement';
import { catalogUnitCost } from './catalog-product';
import { priceValidity } from './catalog-validity';
import { formatDatePY } from './date';

/** Una línea de la orden de compra mientras se arma. */
export interface OrderLine {
  /** Identidad estable de la fila en pantalla. */
  key: string;
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
  /** Solo en líneas tomadas del catálogo del proveedor. */
  catalogItemId: string | null;
  supplierSku: string | null;
  /** Aviso sobre el precio propuesto; no impide ordenar. */
  priceNote: string | null;
}

let sequence = 0;
const nextKey = () => `line-${++sequence}`;

/** Línea para un producto suelto, que no viene del catálogo del proveedor. */
export function emptyLine(): OrderLine {
  return {
    key: nextKey(),
    productId: '',
    productName: '',
    quantity: 1,
    unitCost: 0,
    catalogItemId: null,
    supplierSku: null,
    priceNote: null,
  };
}

/**
 * Línea a partir de un ítem del catálogo, al costo unitario del proveedor.
 * null si el ítem todavía no está vinculado a un producto: no se puede pedir.
 */
export function lineFromCatalogItem(
  item: SupplierCatalogItem,
  todayISO: string,
): OrderLine | null {
  if (!item.productId) return null;
  const expired = priceValidity(item, todayISO).status === 'expired';
  return {
    key: nextKey(),
    productId: item.productId,
    productName: item.product?.name ?? item.description,
    quantity: 1,
    unitCost: catalogUnitCost(item),
    catalogItemId: item.id,
    supplierSku: item.supplierSku,
    priceNote:
      item.price === null
        ? 'El catálogo no trae precio para este ítem'
        : expired
          ? `Precio de lista vencido el ${formatDatePY(item.validTo)}`
          : null,
  };
}

export function orderLinesTotal(lines: readonly OrderLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitCost, 0);
}

// Las líneas del catálogo son del proveedor elegido: al cambiarlo dejan de
// valer (el backend las rechazaría).
export function withoutCatalogLines(lines: readonly OrderLine[]): OrderLine[] {
  return lines.filter((line) => line.catalogItemId === null);
}

export function orderLinesError(lines: readonly OrderLine[]): string | null {
  if (lines.length === 0) return 'Agregá al menos un producto';
  if (lines.some((line) => !line.productId)) {
    return 'Elegí el producto de cada línea o quitá las que sobran';
  }
  if (lines.some((line) => !(line.quantity > 0))) {
    return 'La cantidad de cada línea tiene que ser mayor a cero';
  }
  if (lines.some((line) => !(line.unitCost > 0))) {
    return 'Falta el costo unitario de alguna línea';
  }
  const products = lines.map((line) => line.productId);
  if (new Set(products).size !== products.length) {
    return 'Hay un producto repetido: juntá las cantidades en una sola línea';
  }
  return null;
}

export function toOrderItems(
  lines: readonly OrderLine[],
): CreatePurchaseOrderItem[] {
  return lines.map((line) => ({
    productId: line.productId,
    quantity: line.quantity,
    unitCost: line.unitCost,
    ...(line.catalogItemId && { catalogItemId: line.catalogItemId }),
  }));
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Ítems del catálogo para elegir: primero los que ya se pueden pedir. */
export function catalogChoices(
  items: readonly SupplierCatalogItem[],
  search: string,
): SupplierCatalogItem[] {
  const term = normalize(search.trim());
  const matches = term
    ? items.filter((item) =>
        normalize(
          `${item.supplierSku} ${item.description} ${item.product?.name ?? ''}`,
        ).includes(term),
      )
    : [...items];
  return matches.sort(
    (a, b) => Number(b.productId !== null) - Number(a.productId !== null),
  );
}
