import type { InvoiceItem } from './api/billing';

export interface InvoiceDetailLine {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  ivaRate: number;
  total: number;
}

export interface InvoiceIvaSummary {
  exempt: number;
  taxed5: number;
  taxed10: number;
  iva5: number;
  iva10: number;
  ivaTotal: number;
}

/** En crédito cada ítem se muestra con su parte del total financiado. */
export function invoiceDetailLines(
  items: Pick<InvoiceItem, 'id' | 'description' | 'quantity' | 'unitPrice' | 'total' | 'ivaRate'>[],
  invoiceTotal: number,
  isCredit: boolean,
): InvoiceDetailLine[] {
  const subtotal = items.reduce((sum, item) => sum + Number(item.total), 0);
  return items.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    ivaRate: Number(item.ivaRate ?? 0),
    total:
      isCredit && subtotal > 0 ? invoiceTotal * (Number(item.total) / subtotal) : Number(item.total),
  }));
}

/** Los precios incluyen el IVA: 10 % es 1/11 del importe y 5 % es 1/21. */
export function invoiceIvaSummary(lines: Pick<InvoiceDetailLine, 'ivaRate' | 'total'>[]): InvoiceIvaSummary {
  const byRate = (rate: number) => lines.filter((l) => l.ivaRate === rate).reduce((sum, l) => sum + l.total, 0);
  const taxed5 = byRate(5);
  const taxed10 = byRate(10);
  const exempt = lines.filter((l) => l.ivaRate !== 5 && l.ivaRate !== 10).reduce((sum, l) => sum + l.total, 0);
  const iva5 = Math.round(taxed5 / 21);
  const iva10 = Math.round(taxed10 / 11);
  return { exempt, taxed5, taxed10, iva5, iva10, ivaTotal: iva5 + iva10 };
}

export function ivaRateLabel(rate: number): string {
  return rate === 5 || rate === 10 ? `${rate}%` : 'Exenta';
}
