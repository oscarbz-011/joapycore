import type { FormPoint, PreprintedLayout } from './api/billing';

type PointKey = {
  [K in keyof PreprintedLayout]: PreprintedLayout[K] extends FormPoint ? K : never;
}[keyof PreprintedLayout];

export interface PointField {
  key: PointKey;
  label: string;
}

/** Datos ubicados por un punto (X, Y), en el orden en que aparecen en la hoja. */
export const POINT_FIELDS: { title: string; fields: PointField[] }[] = [
  {
    title: 'Encabezado',
    fields: [
      { key: 'date', label: 'Fecha de emisión' },
      { key: 'cashMark', label: 'Marca de contado' },
      { key: 'creditMark', label: 'Marca de crédito' },
      { key: 'buyerName', label: 'Nombre o razón social' },
      { key: 'buyerDocument', label: 'RUC o C.I.' },
      { key: 'buyerAddress', label: 'Dirección' },
    ],
  },
  {
    title: 'Totales (importes: X es el borde derecho)',
    fields: [
      { key: 'total', label: 'Total a pagar' },
      { key: 'totalInWords', label: 'Total en letras' },
      { key: 'iva5', label: 'Liquidación IVA 5%' },
      { key: 'iva10', label: 'Liquidación IVA 10%' },
      { key: 'ivaTotal', label: 'Total IVA' },
    ],
  },
];

type ItemKey = keyof PreprintedLayout['items'];

export const ITEM_FIELDS: { key: ItemKey; label: string; step: number }[] = [
  { key: 'top', label: 'Primera línea (Y)', step: 0.5 },
  { key: 'lineHeight', label: 'Alto de cada línea', step: 0.5 },
  { key: 'maxLines', label: 'Líneas por hoja', step: 1 },
  { key: 'quantityX', label: 'Cantidad (borde derecho)', step: 0.5 },
  { key: 'descriptionX', label: 'Descripción (inicio)', step: 0.5 },
  { key: 'descriptionWidth', label: 'Ancho de la descripción', step: 0.5 },
  { key: 'unitPriceX', label: 'Precio unitario (borde derecho)', step: 0.5 },
  { key: 'exemptX', label: 'Exentas (borde derecho)', step: 0.5 },
  { key: 'taxed5X', label: 'Gravadas 5% (borde derecho)', step: 0.5 },
  { key: 'taxed10X', label: 'Gravadas 10% (borde derecho)', step: 0.5 },
];

type SheetKey = 'pageWidth' | 'pageHeight' | 'fontSize' | 'offsetX' | 'offsetY' | 'subtotalsY';

export const SHEET_FIELDS: { key: SheetKey; label: string; unit: string }[] = [
  { key: 'pageWidth', label: 'Ancho de la hoja', unit: 'mm' },
  { key: 'pageHeight', label: 'Alto de la hoja', unit: 'mm' },
  { key: 'fontSize', label: 'Tamaño de letra', unit: 'pt' },
  { key: 'offsetX', label: 'Corrimiento horizontal', unit: 'mm' },
  { key: 'offsetY', label: 'Corrimiento vertical', unit: 'mm' },
  { key: 'subtotalsY', label: 'Fila de subtotales (Y)', unit: 'mm' },
];

const finite = (n: number) => Number.isFinite(n);

/** Por qué el diseño no se puede guardar, o null. Mismos límites que el servidor. */
export function layoutProblem(layout: PreprintedLayout): string | null {
  if (!finite(layout.pageWidth) || layout.pageWidth < 50 || layout.pageWidth > 500) {
    return 'El ancho de la hoja va de 50 a 500 mm';
  }
  if (!finite(layout.pageHeight) || layout.pageHeight < 50 || layout.pageHeight > 500) {
    return 'El alto de la hoja va de 50 a 500 mm';
  }
  if (!finite(layout.fontSize) || layout.fontSize < 6 || layout.fontSize > 16) {
    return 'El tamaño de letra va de 6 a 16 pt';
  }
  if (Math.abs(layout.offsetX) > 30 || Math.abs(layout.offsetY) > 30 || !finite(layout.offsetX) || !finite(layout.offsetY)) {
    return 'El corrimiento va de -30 a 30 mm';
  }
  const { items } = layout;
  if (!Number.isInteger(items.maxLines) || items.maxLines < 1 || items.maxLines > 60) {
    return 'Las líneas por hoja van de 1 a 60';
  }
  if (!finite(items.lineHeight) || items.lineHeight < 2 || items.lineHeight > 30) {
    return 'El alto de cada línea va de 2 a 30 mm';
  }
  if (!finite(items.descriptionWidth) || items.descriptionWidth < 5) {
    return 'La descripción tiene que tener al menos 5 mm de ancho';
  }
  const positions = [
    layout.subtotalsY,
    items.top,
    items.quantityX,
    items.descriptionX,
    items.unitPriceX,
    items.exemptX,
    items.taxed5X,
    items.taxed10X,
    ...POINT_FIELDS.flatMap((group) => group.fields.flatMap((f) => [layout[f.key].x, layout[f.key].y])),
  ];
  if (positions.some((n) => !finite(n) || n < 0 || n > 500)) {
    return 'Las posiciones van de 0 a 500 mm';
  }
  return null;
}
