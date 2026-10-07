// Condiciones comerciales de un proveedor: lo que se compara además del precio.

/** Descuento sobre el total de la orden, desde cierto monto. */
export interface VolumeDiscount {
  minAmount: number;
  percent: number;
}

/** Descuento sobre el total de la orden, desde cierta cantidad de unidades. */
export interface QuantityDiscount {
  minQuantity: number;
  percent: number;
}

/** Precio de un ítem desde cierta cantidad, en la unidad del proveedor. */
export interface PriceTier {
  minQuantity: number;
  price: number;
}

export type SupplierAvailability = 'AVAILABLE' | 'ON_ORDER' | 'OUT_OF_STOCK';

export const AVAILABILITY_LABEL: Record<SupplierAvailability, string> = {
  AVAILABLE: 'Disponible',
  ON_ORDER: 'A pedido',
  OUT_OF_STOCK: 'Sin stock',
};

/**
 * Número o null. La API manda los decimales como texto y un dato sin cargar
 * como null: null es "no se sabe", que no es lo mismo que cero.
 */
export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ── Edición de tramos ────────────────────────────────────────────────────────

/** Un tramo mientras se edita: "desde" y su valor, como texto. */
export interface TierRow {
  from: string;
  value: string;
}

export function tierRowsFrom<F extends string, V extends string>(
  tiers: readonly Record<F | V, number>[] | null | undefined,
  fromKey: F,
  valueKey: V,
): TierRow[] {
  return (tiers ?? []).map((tier) => ({
    from: String(tier[fromKey]),
    value: String(tier[valueKey]),
  }));
}

const isBlank = (row: TierRow) => !row.from.trim() && !row.value.trim();

/** Las filas en blanco se descartan: son las que quedaron sin usar. */
export function tierRowsTo<F extends string, V extends string>(
  rows: readonly TierRow[],
  fromKey: F,
  valueKey: V,
): Record<F | V, number>[] {
  return rows
    .filter((row) => !isBlank(row))
    .map(
      (row) =>
        ({
          [fromKey]: Number(row.from),
          [valueKey]: Number(row.value),
        }) as Record<F | V, number>,
    );
}

export function tierRowsError(rows: readonly TierRow[]): string | null {
  const used = rows.filter((row) => !isBlank(row));
  if (used.some((row) => !row.from.trim() || !row.value.trim())) {
    return 'Hay un tramo incompleto: completalo o quitalo';
  }
  if (used.some((row) => !(Number(row.from) > 0) || !(Number(row.value) > 0))) {
    return 'Los valores de cada tramo tienen que ser mayores a cero';
  }
  const starts = used.map((row) => Number(row.from));
  if (new Set(starts).size !== starts.length) {
    return 'Hay un tramo repetido: cada uno tiene que empezar en un valor distinto';
  }
  return null;
}

const gs = (n: number) => 'Gs. ' + new Intl.NumberFormat('es-PY').format(n);
const plain = (n: number) =>
  new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 }).format(n);

export function volumeDiscountsSummary(
  discounts: readonly VolumeDiscount[],
): string {
  if (discounts.length === 0) return 'Sin descuentos';
  return discounts
    .map((tier) => `${plain(tier.percent)}% desde ${gs(tier.minAmount)}`)
    .join(' · ');
}

export function quantityDiscountsSummary(
  discounts: readonly QuantityDiscount[],
): string {
  if (discounts.length === 0) return 'Sin descuentos';
  return discounts
    .map(
      (tier) =>
        `${plain(tier.percent)}% desde ${plain(tier.minQuantity)} ${tier.minQuantity === 1 ? 'unidad' : 'unidades'}`,
    )
    .join(' · ');
}
