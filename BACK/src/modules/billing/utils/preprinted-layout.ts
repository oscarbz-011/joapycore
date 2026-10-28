import type {
  FormPoint,
  PreprintedLayout,
} from '../../../common/contracts/billing-gateway.contract';

// Punto de partida para una hoja de 216 × 140 mm; cada talonario se calibra
// con "Imprimir prueba" porque cada imprenta ubica los campos distinto.
export const DEFAULT_PREPRINTED_LAYOUT: PreprintedLayout = {
  pageWidth: 216,
  pageHeight: 140,
  offsetX: 0,
  offsetY: 0,
  fontSize: 10,
  date: { x: 30, y: 38 },
  cashMark: { x: 150, y: 38 },
  creditMark: { x: 180, y: 38 },
  buyerName: { x: 45, y: 45 },
  buyerDocument: { x: 150, y: 45 },
  buyerAddress: { x: 30, y: 52 },
  items: {
    top: 66,
    lineHeight: 5,
    maxLines: 10,
    quantityX: 20,
    descriptionX: 24,
    descriptionWidth: 80,
    unitPriceX: 130,
    exemptX: 155,
    taxed5X: 180,
    taxed10X: 205,
  },
  subtotalsY: 118,
  total: { x: 205, y: 124 },
  totalInWords: { x: 30, y: 124 },
  iva5: { x: 60, y: 131 },
  iva10: { x: 110, y: 131 },
  ivaTotal: { x: 180, y: 131 },
};

const POINTS = [
  'date',
  'cashMark',
  'creditMark',
  'buyerName',
  'buyerDocument',
  'buyerAddress',
  'total',
  'totalInWords',
  'iva5',
  'iva10',
  'ivaTotal',
] as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const num = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

function point(value: unknown, fallback: FormPoint): FormPoint {
  if (!isRecord(value)) return fallback;
  return { x: num(value.x, fallback.x), y: num(value.y, fallback.y) };
}

/** El diseño guardado de la serie, completado con el estándar. */
export function resolvePreprintedLayout(value: unknown): PreprintedLayout {
  const base = DEFAULT_PREPRINTED_LAYOUT;
  if (!isRecord(value)) return base;
  const items = isRecord(value.items) ? value.items : {};
  const layout: PreprintedLayout = {
    ...base,
    pageWidth: num(value.pageWidth, base.pageWidth),
    pageHeight: num(value.pageHeight, base.pageHeight),
    offsetX: num(value.offsetX, base.offsetX),
    offsetY: num(value.offsetY, base.offsetY),
    fontSize: num(value.fontSize, base.fontSize),
    subtotalsY: num(value.subtotalsY, base.subtotalsY),
    items: {
      top: num(items.top, base.items.top),
      lineHeight: num(items.lineHeight, base.items.lineHeight),
      maxLines: num(items.maxLines, base.items.maxLines),
      quantityX: num(items.quantityX, base.items.quantityX),
      descriptionX: num(items.descriptionX, base.items.descriptionX),
      descriptionWidth: num(
        items.descriptionWidth,
        base.items.descriptionWidth,
      ),
      unitPriceX: num(items.unitPriceX, base.items.unitPriceX),
      exemptX: num(items.exemptX, base.items.exemptX),
      taxed5X: num(items.taxed5X, base.items.taxed5X),
      taxed10X: num(items.taxed10X, base.items.taxed10X),
    },
  };
  for (const key of POINTS) layout[key] = point(value[key], base[key]);
  return layout;
}

/** Por qué los ítems no entran en la hoja, o null si entran. */
export function formFitProblem(
  layout: PreprintedLayout,
  itemCount: number,
): string | null {
  if (itemCount <= layout.items.maxLines) return null;
  return `La factura tiene ${itemCount} ítems y la hoja del talonario admite ${layout.items.maxLines}. Dividí la venta en más de una factura o ajustá el diseño de impresión de la serie.`;
}
