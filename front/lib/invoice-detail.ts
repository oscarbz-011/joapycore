import { money, roundGuaranies, sumMoney } from '@/lib/money';
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
  const subtotal = sumMoney(items.map((item) => item.total));
  const ratio = isCredit && subtotal.gt(0) ? money(invoiceTotal).div(subtotal) : money(1);
  return items.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    ivaRate: Number(item.ivaRate ?? 0),
    total: roundGuaranies(money(item.total).mul(ratio)).toNumber(),
  }));
}

/** Los precios incluyen el IVA: 10 % es 1/11 del importe y 5 % es 1/21. */
export function invoiceIvaSummary(lines: Pick<InvoiceDetailLine, 'ivaRate' | 'total'>[]): InvoiceIvaSummary {
  const byRate = (rate: number) =>
    sumMoney(lines.filter((l) => l.ivaRate === rate).map((l) => l.total));
  const taxed5 = byRate(5);
  const taxed10 = byRate(10);
  const exempt = sumMoney(
    lines.filter((l) => l.ivaRate !== 5 && l.ivaRate !== 10).map((l) => l.total),
  );
  const iva5 = roundGuaranies(taxed5.div(21));
  const iva10 = roundGuaranies(taxed10.div(11));
  return {
    exempt: exempt.toNumber(),
    taxed5: taxed5.toNumber(),
    taxed10: taxed10.toNumber(),
    iva5: iva5.toNumber(),
    iva10: iva10.toNumber(),
    ivaTotal: iva5.plus(iva10).toNumber(),
  };
}

export function ivaRateLabel(rate: number): string {
  return rate === 5 || rate === 10 ? `${rate}%` : 'Exenta';
}
