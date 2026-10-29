import type { FiscalReceipt, FormPoint, PreprintedLayout } from './api/billing';
import { guaraniesInWords } from './number-to-words';
import { escapeHtml, printHtmlDocument } from './print-html';

// Copia del diseño estándar del backend (preprinted-layout.ts): el backend
// siempre devuelve el diseño completo; esta copia es para pruebas y ejemplos.
export const STANDARD_PREPRINTED_LAYOUT: PreprintedLayout = {
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

// Ancho de la caja de un importe alineado a la derecha: su `x` es el borde derecho.
const AMOUNT_BOX_MM = 60;

const gs = (n: number) => new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n || 0);

function issueDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    timeZone: 'America/Asuncion',
  });
}

function placer(layout: PreprintedLayout) {
  const mm = (n: number) => `${Math.round(n * 100) / 100}mm`;
  return {
    left(point: FormPoint, text: string, width?: number) {
      if (!text) return '';
      const size = width ? `width:${mm(width)};overflow:hidden;` : '';
      return `<div style="left:${mm(point.x + layout.offsetX)};top:${mm(point.y + layout.offsetY)};${size}">${escapeHtml(text)}</div>`;
    },
    right(point: FormPoint, text: string) {
      if (!text) return '';
      return `<div class="amount" style="left:${mm(point.x + layout.offsetX - AMOUNT_BOX_MM)};top:${mm(point.y + layout.offsetY)};width:${mm(AMOUNT_BOX_MM)}">${escapeHtml(text)}</div>`;
    },
  };
}

function columnFor(layout: PreprintedLayout, ivaRate: number): number {
  if (ivaRate === 10) return layout.items.taxed10X;
  if (ivaRate === 5) return layout.items.taxed5X;
  return layout.items.exemptX;
}

/**
 * Lo que se imprime sobre la hoja del talonario: solo los datos variables,
 * cada uno en su lugar. Los datos de la empresa, el timbrado y el número ya
 * vienen impresos en la hoja.
 */
export function preprintedFormHtml(receipt: FiscalReceipt, layout: PreprintedLayout): string {
  const place = placer(layout);
  const items = layout.items;
  const totals = receipt.totals;

  const lines = receipt.lines.slice(0, items.maxLines).map((line, index) => {
    const y = items.top + index * items.lineHeight;
    return [
      place.right({ x: items.quantityX, y }, String(line.quantity)),
      place.left({ x: items.descriptionX, y }, line.description, items.descriptionWidth),
      place.right({ x: items.unitPriceX, y }, gs(line.unitPrice)),
      place.right({ x: columnFor(layout, line.ivaRate), y }, gs(line.total)),
    ].join('');
  });

  const subtotal = (x: number, amount: number) =>
    amount ? place.right({ x, y: layout.subtotalsY }, gs(amount)) : '';

  const fields = [
    place.left(layout.date, issueDate(receipt.issuedAt)),
    place.left(receipt.condition === 'CRÉDITO' ? layout.creditMark : layout.cashMark, 'X'),
    place.left(layout.buyerName, receipt.buyer.name),
    place.left(layout.buyerDocument, receipt.buyer.document),
    place.left(layout.buyerAddress, receipt.buyer.address ?? ''),
    ...lines,
    subtotal(items.exemptX, totals.exempt),
    subtotal(items.taxed5X, totals.taxed5),
    subtotal(items.taxed10X, totals.taxed10),
    place.right(layout.total, gs(totals.total)),
    place.left(layout.totalInWords, guaraniesInWords(totals.total)),
    place.right(layout.iva5, gs(totals.iva5)),
    place.right(layout.iva10, gs(totals.iva10)),
    place.right(layout.ivaTotal, gs(totals.ivaTotal)),
  ].join('\n');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Factura ${escapeHtml(receipt.number)}</title>
<style>
@page { size: ${layout.pageWidth}mm ${layout.pageHeight}mm; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { position: relative; width: ${layout.pageWidth}mm; height: ${layout.pageHeight}mm; font-family: 'Courier New', monospace; font-size: ${layout.fontSize}pt; color: #000; }
body > div { position: absolute; white-space: nowrap; line-height: 1; }
.amount { text-align: right; }
</style></head>
<body>
${fields}
</body></html>`;
}

/** Factura de ejemplo para calibrar el diseño con "Imprimir prueba". */
export function sampleFiscalReceipt(): FiscalReceipt {
  return {
    invoiceId: 'prueba',
    modality: 'PREPRINTED',
    number: '001-001-0000000',
    timbrado: null,
    timbradoValidFrom: null,
    timbradoValidUntil: null,
    issuedAt: new Date().toISOString(),
    condition: 'CONTADO',
    issuer: {
      name: '',
      fantasyName: null,
      ruc: null,
      address: null,
      city: null,
      phone: null,
      activity: null,
      branchName: null,
      branchAddress: null,
    },
    buyer: { name: 'NOMBRE O RAZÓN SOCIAL DE PRUEBA', document: 'RUC 80000000-0', address: 'DIRECCIÓN DE PRUEBA 123' },
    lines: [
      { description: 'PRODUCTO GRAVADO 10%', quantity: 2, unitPrice: 110_000, total: 220_000, ivaRate: 10 },
      { description: 'PRODUCTO GRAVADO 5%', quantity: 1, unitPrice: 52_500, total: 52_500, ivaRate: 5 },
      { description: 'PRODUCTO EXENTO', quantity: 3, unitPrice: 10_000, total: 30_000, ivaRate: 0 },
    ],
    totals: {
      exempt: 30_000,
      taxed5: 52_500,
      taxed10: 220_000,
      iva5: 2_500,
      iva10: 20_000,
      ivaTotal: 22_500,
      total: 302_500,
    },
    formLayout: null,
  };
}

export function printPreprintedForm(receipt: FiscalReceipt, layout: PreprintedLayout): void {
  printHtmlDocument(preprintedFormHtml(receipt, layout));
}
