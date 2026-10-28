import type { PosInvoiceSeries, PosPrintFormat, PosReceipt } from './api/pos';
import { paymentMethodLabel } from './payment-methods';
import { printPreprintedForm } from './preprinted-form';
import { escapeHtml, printHtmlDocument } from './print-html';

export const PRINT_FORMAT_LABELS: Record<PosPrintFormat, string> = {
  THERMAL_58: 'Térmica 58 mm',
  THERMAL_80: 'Térmica 80 mm',
  A4: 'A4',
  HALF_LETTER: 'Media carta',
};

export function isThermal(format: PosPrintFormat): boolean {
  return format === 'THERMAL_58' || format === 'THERMAL_80';
}

/**
 * La factura solo se imprime en papel térmico si la caja tiene el informe de
 * durabilidad del papel y sus condiciones de conservación (RG 27/19).
 */
export function thermalProblem(terminal: {
  thermalPaperReportFileId: string | null;
  thermalPaperConservation: string | null;
}): string | null {
  if (!terminal.thermalPaperReportFileId) {
    return 'Para imprimir en papel térmico cargá el informe de durabilidad del papel';
  }
  if (!terminal.thermalPaperConservation?.trim()) {
    return 'Para imprimir en papel térmico cargá las condiciones de conservación del papel';
  }
  return null;
}

/** Por qué la caja no puede facturar hoy, o null si puede. */
export function seriesBlocker(series: PosInvoiceSeries | null): string | null {
  if (!series) {
    return 'Esta caja no tiene una serie de facturas. Asignala en Ajustes → Cajas para poder cobrar.';
  }
  return series.problem;
}

/** Con talonario de imprenta el cajero escribe el número de la hoja que entrega. */
export function needsTalonarioNumber(series: PosInvoiceSeries | null): boolean {
  return series?.modality === 'PREPRINTED';
}

/** Problema con el número de hoja del talonario, o null si sirve. */
export function talonarioNumberProblem(
  series: PosInvoiceSeries,
  value: string,
): string | null {
  if (!value.trim()) return 'Escribí el número de la hoja del talonario';
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) return 'El número tiene que ser un entero positivo';
  if (number < series.rangeFrom || number > series.rangeTo) {
    return `El talonario va del ${series.rangeFrom} al ${series.rangeTo}`;
  }
  return null;
}

const PAGE: Record<PosPrintFormat, { page: string; width: string; font: string }> = {
  THERMAL_58: { page: '58mm auto', width: '50mm', font: '9px' },
  THERMAL_80: { page: '80mm auto', width: '72mm', font: '10.5px' },
  A4: { page: 'A4', width: '100%', font: '12px' },
  HALF_LETTER: { page: '5.5in 8.5in', width: '100%', font: '11px' },
};

const gs = (n: number) => new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n || 0);

function shortDate(iso: string | null, withTime = false): string {
  if (!iso) return '—';
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    // Las vigencias del timbrado son días de calendario; la emisión es un instante.
    timeZone: withTime ? 'America/Asuncion' : 'UTC',
    ...(withTime ? { hour: '2-digit', minute: '2-digit', hour12: false } : {}),
  };
  return date.toLocaleString('es-PY', options);
}

const ivaLabel = (rate: number) => (rate === 5 ? '5%' : rate === 10 ? '10%' : 'Ex.');

function line(label: string, value: string, strong = false) {
  const tag = strong ? 'strong' : 'span';
  return `<div class="row"><${tag}>${escapeHtml(label)}</${tag}><${tag}>${escapeHtml(value)}</${tag}></div>`;
}

/** Documento HTML de la factura de caja, con el tamaño de hoja de la caja. */
export function receiptHtml(receipt: PosReceipt): string {
  const format = PAGE[receipt.printFormat];
  const { issuer, totals } = receipt;
  const preprinted = receipt.modality === 'PREPRINTED';

  const header = [
    `<div class="center strong">${escapeHtml(issuer.name)}</div>`,
    issuer.fantasyName ? `<div class="center">${escapeHtml(issuer.fantasyName)}</div>` : '',
    issuer.ruc ? `<div class="center">RUC: ${escapeHtml(issuer.ruc)}</div>` : '',
    issuer.activity ? `<div class="center small">${escapeHtml(issuer.activity)}</div>` : '',
    issuer.address
      ? `<div class="center small">${escapeHtml([issuer.address, issuer.city].filter(Boolean).join(', '))}</div>`
      : '',
    issuer.branchName
      ? `<div class="center small">Sucursal ${escapeHtml(issuer.branchName)}${issuer.branchAddress ? ` – ${escapeHtml(issuer.branchAddress)}` : ''}</div>`
      : '',
    issuer.phone ? `<div class="center small">Tel.: ${escapeHtml(issuer.phone)}</div>` : '',
  ].join('');

  const fiscal = [
    receipt.timbrado ? line('Timbrado N°', receipt.timbrado) : '',
    receipt.timbradoValidFrom ? line('Vigencia desde', shortDate(receipt.timbradoValidFrom)) : '',
    receipt.timbradoValidUntil ? line('Vigencia hasta', shortDate(receipt.timbradoValidUntil)) : '',
    `<div class="center strong title">FACTURA</div>`,
    `<div class="center strong">N° ${escapeHtml(receipt.number)}</div>`,
    line('Fecha', shortDate(receipt.issuedAt, true)),
    line('Condición', receipt.condition),
    line('Nombre o razón social', receipt.buyer.name),
    line('RUC / C.I.', receipt.buyer.document),
  ].join('');

  const items = receipt.lines
    .map(
      (item) =>
        `<div class="item"><div>${escapeHtml(item.description)}</div>${line(
          `${item.quantity} x ${gs(item.unitPrice)}  (${ivaLabel(item.ivaRate)})`,
          gs(item.total),
        )}</div>`,
    )
    .join('');

  const subtotals = [
    line('Exentas', gs(totals.exempt)),
    line('Gravadas 5%', gs(totals.taxed5)),
    line('Gravadas 10%', gs(totals.taxed10)),
    line('TOTAL A PAGAR Gs.', gs(totals.total), true),
    `<div class="strong">Liquidación del IVA</div>`,
    line('IVA 5%', gs(totals.iva5)),
    line('IVA 10%', gs(totals.iva10)),
    line('Total IVA', gs(totals.ivaTotal)),
  ].join('');

  const payments = [
    ...receipt.payments.map((p) => line(paymentMethodLabel(p.paymentMethod), gs(p.amount))),
    receipt.change > 0 ? line('Vuelto', gs(receipt.change)) : '',
  ].join('');

  const footer = [
    `<div class="small">Caja: ${escapeHtml(receipt.terminalName)} · Cajero: ${escapeHtml(receipt.cashierName)}</div>`,
    preprinted
      ? `<div class="center strong">COMPROBANTE INTERNO – NO VÁLIDO COMO COMPROBANTE FISCAL</div><div class="center small">La factura es la hoja N° ${escapeHtml(receipt.number)} del talonario</div>`
      : `<div class="center strong">${receipt.copy ? 'COPIA' : 'ORIGINAL: CLIENTE'}</div>`,
    isThermal(receipt.printFormat) && receipt.paperConservation
      ? `<div class="center small">${escapeHtml(receipt.paperConservation)}</div>`
      : '',
  ].join('');

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Factura ${escapeHtml(receipt.number)}</title>
<style>
@page { size: ${format.page}; margin: ${isThermal(receipt.printFormat) ? '2mm' : '10mm'}; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Courier New', monospace; font-size: ${format.font}; color: #000; }
main { width: ${format.width}; margin: 0 auto; }
.center { text-align: center; }
.strong { font-weight: 700; }
.small { font-size: 0.85em; }
.title { margin-top: 4px; font-size: 1.15em; }
.row { display: flex; justify-content: space-between; gap: 8px; }
.item { margin-bottom: 3px; }
hr { border: 0; border-top: 1px dashed #000; margin: 4px 0; }
</style></head>
<body><main>
${header}<hr>${fiscal}<hr>${items}<hr>${subtotals}<hr>${payments}<hr>${footer}
</main></body></html>`;
}

/**
 * Imprime la factura sin salir de la pantalla de caja. Con talonario de
 * imprenta los datos van sobre la hoja preimpresa.
 */
export function printReceipt(receipt: PosReceipt): void {
  if (receipt.modality === 'PREPRINTED' && receipt.formLayout) {
    printPreprintedForm(receipt, receipt.formLayout);
    return;
  }
  printHtmlDocument(receiptHtml(receipt));
}
