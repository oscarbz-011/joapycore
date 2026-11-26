import { UnprocessableEntityException } from '@nestjs/common';
import { Industry, Prisma } from '@prisma/client';
import { qty, type Quantity, type QuantityValue } from './quantity';
import { unitSymbol } from './units-of-measure';

export type Dimension = 'length' | 'width' | 'height';

export interface Measure {
  kind: 'LENGTH' | 'AREA' | 'VOLUME';
  dimensions: Dimension[];
  /** En qué se cargan las medidas: m², por ejemplo, en metros. */
  linearSymbol: string;
}

export type Dimensions = Partial<
  Record<Dimension, QuantityValue | null | undefined>
>;

const LENGTH: Dimension[] = ['length'];
const AREA: Dimension[] = ['length', 'width'];
const VOLUME: Dimension[] = ['length', 'width', 'height'];

const measure = (
  kind: Measure['kind'],
  dimensions: Dimension[],
  linearSymbol: string,
): Measure => ({ kind, dimensions, linearSymbol });

const MEASURES = new Map<number, Measure>([
  [87, measure('LENGTH', LENGTH, 'm')],
  [660, measure('LENGTH', LENGTH, 'm')],
  [91, measure('LENGTH', LENGTH, 'cm')],
  [95, measure('LENGTH', LENGTH, 'mm')],
  [109, measure('AREA', AREA, 'm')],
  [92, measure('AREA', AREA, 'cm')],
  [96, measure('AREA', AREA, 'mm')],
  [110, measure('VOLUME', VOLUME, 'm')],
  [93, measure('VOLUME', VOLUME, 'cm')],
]);

const LABEL: Record<Dimension, string> = {
  length: 'largo',
  width: 'ancho',
  height: 'alto',
};

const DECIMALS = 3;
// La escala de la columna: el factor queda exacto (5,0325 m² es 5,0325, no
// 5,033), así cada pieza vendida descuenta exactamente lo que ocupa.
const FACTOR_DECIMALS = 8;

/** Si la unidad se calcula con medidas (longitud, área o volumen). */
export function measureOf(unitCode: number): Measure | null {
  return MEASURES.get(unitCode) ?? null;
}

const fail = (message: string) => new UnprocessableEntityException(message);

/**
 * Cuánto de la unidad del producto ocupan unas medidas: el largo de un
 * listón, el área de una plancha o el volumen de una viga. Cada medida admite
 * 3 decimales (milímetros si se carga en metros).
 */
export function factorFromDimensions(
  unitCode: number,
  dimensions: Dimensions,
): Quantity {
  const measure = measureOf(unitCode);
  if (!measure) {
    throw fail(`La unidad ${unitSymbol(unitCode)} no se calcula con medidas`);
  }
  const extra = (Object.keys(LABEL) as Dimension[]).find(
    (d) => !measure.dimensions.includes(d) && dimensions[d] != null,
  );
  if (extra) {
    throw fail(
      `La unidad ${unitSymbol(unitCode)} solo lleva ${measure.dimensions.map((d) => LABEL[d]).join(', ')}`,
    );
  }
  const factor = measure.dimensions.reduce<Quantity>((product, d) => {
    const value = dimensions[d];
    if (value == null || value === '') throw fail(`Falta el ${LABEL[d]}`);
    const size = qty(value);
    if (size.lte(0)) {
      throw fail(`El ${LABEL[d]} tiene que ser mayor que cero`);
    }
    if (size.decimalPlaces() > DECIMALS) {
      throw fail(`El ${LABEL[d]} admite hasta ${DECIMALS} decimales`);
    }
    return product.mul(size);
  }, new Prisma.Decimal(1));
  const rounded = factor.toDecimalPlaces(
    FACTOR_DECIMALS,
    Prisma.Decimal.ROUND_HALF_UP,
  );
  if (rounded.isZero()) throw fail('La medida es demasiado chica');
  return rounded;
}

const ENABLED_BY_INDUSTRY: ReadonlySet<Industry> = new Set<Industry>([
  'FERRETERIA',
  'MUEBLERIA',
  'SUPERMERCADO',
]);

/** Lo que eligió la empresa o, si no eligió, lo que trae su rubro. */
export function presentationsEnabledFor(
  chosen: boolean | null | undefined,
  industry: Industry | null | undefined,
): boolean {
  if (chosen != null) return chosen;
  return industry != null && ENABLED_BY_INDUSTRY.has(industry);
}

export interface SoldAs {
  presentationName?: string | null;
  cutLength?: QuantityValue | null;
  cutWidth?: QuantityValue | null;
  cutHeight?: QuantityValue | null;
}

const decimalComma = (value: QuantityValue) =>
  qty(value).toString().replace('.', ',');

/**
 * Cómo se vendió una línea, para el detalle de la factura, la remisión o el
 * presupuesto: "Plancha entera" o "corte 1,2 × 0,6 m". null si se vendió en
 * la unidad del producto.
 */
export function soldAsLabel(
  line: SoldAs,
  productUnitCode: number,
): string | null {
  if (line.presentationName) return line.presentationName;
  const sizes = [line.cutLength, line.cutWidth, line.cutHeight].filter(
    (value): value is QuantityValue => value != null,
  );
  if (sizes.length === 0) return null;
  const linear = measureOf(productUnitCode)?.linearSymbol ?? '';
  return `corte ${sizes.map(decimalComma).join(' × ')} ${linear}`.trim();
}

/** "MDF 18 mm — Plancha entera"; el nombre solo si se vendió en su unidad. */
export function withSoldAs(
  name: string,
  line: SoldAs,
  productUnitCode: number,
): string {
  const label = soldAsLabel(line, productUnitCode);
  return label ? `${name} — ${label}` : name;
}
