import Decimal from 'decimal.js';
import { roundGuaranies } from './money';
import { formatQty, qty, type QuantityValue } from './quantity';
import { DEFAULT_UNIT_CODE, unitOfMeasure, unitSymbol } from './units-of-measure';

export type Dimension = 'length' | 'width' | 'height';

export interface Measure {
  kind: 'LENGTH' | 'AREA' | 'VOLUME';
  dimensions: Dimension[];
  /** En qué se cargan las medidas: m², por ejemplo, en metros. */
  linearSymbol: string;
}

export type Dimensions = Partial<Record<Dimension, QuantityValue | null | undefined>>;

const LENGTH: Dimension[] = ['length'];
const AREA: Dimension[] = ['length', 'width'];
const VOLUME: Dimension[] = ['length', 'width', 'height'];

// Igual que el backend (common/units/dimensions.ts).
const MEASURES = new Map<number, Measure>([
  [87, { kind: 'LENGTH', dimensions: LENGTH, linearSymbol: 'm' }],
  [660, { kind: 'LENGTH', dimensions: LENGTH, linearSymbol: 'm' }],
  [91, { kind: 'LENGTH', dimensions: LENGTH, linearSymbol: 'cm' }],
  [95, { kind: 'LENGTH', dimensions: LENGTH, linearSymbol: 'mm' }],
  [109, { kind: 'AREA', dimensions: AREA, linearSymbol: 'm' }],
  [92, { kind: 'AREA', dimensions: AREA, linearSymbol: 'cm' }],
  [96, { kind: 'AREA', dimensions: AREA, linearSymbol: 'mm' }],
  [110, { kind: 'VOLUME', dimensions: VOLUME, linearSymbol: 'm' }],
  [93, { kind: 'VOLUME', dimensions: VOLUME, linearSymbol: 'cm' }],
]);

export const DIMENSION_LABEL: Record<Dimension, string> = {
  length: 'Largo',
  width: 'Ancho',
  height: 'Alto',
};

const FACTOR_DECIMALS = 8;

export function measureOf(unitCode: number | null | undefined): Measure | null {
  return unitCode == null ? null : (MEASURES.get(unitCode) ?? null);
}

/**
 * Lo que ocupan unas medidas en la unidad del producto (exacto, como lo
 * guarda el backend). null mientras falte alguna o no sea positiva.
 */
export function factorFromDimensions(unitCode: number, dimensions: Dimensions): Decimal | null {
  const measure = measureOf(unitCode);
  if (!measure) return null;
  let factor = new Decimal(1);
  for (const d of measure.dimensions) {
    const value = dimensions[d];
    if (value == null || value === '') return null;
    const size = qty(value);
    if (size.lte(0)) return null;
    factor = factor.mul(size);
  }
  const rounded = factor.toDecimalPlaces(FACTOR_DECIMALS, Decimal.ROUND_HALF_UP);
  return rounded.isZero() ? null : rounded;
}

/** Precio de una pieza a medida: el precio de la unidad por lo que ocupa. */
export function cutUnitPrice(basePrice: QuantityValue, factor: Decimal): number {
  return roundGuaranies(qty(basePrice).mul(factor)).toNumber();
}

export interface SoldAs {
  presentationName?: string | null;
  cutLength?: QuantityValue | null;
  cutWidth?: QuantityValue | null;
  cutHeight?: QuantityValue | null;
}

/** "Plancha entera" o "corte 1,2 × 0,6 m"; null si se vendió en la unidad del producto. */
export function soldAsLabel(line: SoldAs, productUnitCode: number | null | undefined): string | null {
  if (line.presentationName) return line.presentationName;
  const sizes = [line.cutLength, line.cutWidth, line.cutHeight].filter(
    (value): value is QuantityValue => value != null && value !== '',
  );
  if (sizes.length === 0) return null;
  const linear = measureOf(productUnitCode)?.linearSymbol ?? '';
  return `corte ${sizes.map((s) => formatQty(s)).join(' × ')} ${linear}`.trim();
}

/** Cómo se lee la cantidad de una línea: "2 UNI", "2,375 M2". */
export function soldUnitSymbol(line: { unitCode?: number | null }, productUnitCode: number | null | undefined) {
  return unitSymbol(line.unitCode ?? productUnitCode ?? DEFAULT_UNIT_CODE);
}

/** "5,0325 M2" — lo que lleva una presentación o una pieza. */
export function factorText(factor: QuantityValue, productUnitCode: number) {
  return `${formatQty(factor, 8)} ${unitOfMeasure(productUnitCode).symbol}`;
}

/** Nombre de una línea de venta: "MDF 18 mm — Plancha entera", o la descripción libre. */
export function saleItemName(
  item: SoldAs & {
    description?: string | null;
    product?: { name: string; unitCode?: number | null } | null;
  },
): string {
  if (!item.product) return item.description ?? 'Ítem';
  const label = soldAsLabel(item, item.product.unitCode);
  return label ? `${item.product.name} — ${label}` : item.product.name;
}
