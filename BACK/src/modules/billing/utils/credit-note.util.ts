import { UnprocessableEntityException } from '@nestjs/common';
import type { CreditNoteKind } from '@prisma/client';

type Numeric = number | { toNumber(): number };
const toNum = (value: Numeric): number =>
  typeof value === 'object' ? value.toNumber() : value;
const round2 = (n: number) => Math.round(n * 100) / 100;

export const ivaIncluded = (total: number, rate: number) =>
  Math.round((total * rate) / (100 + rate));

export interface InvoiceItemForCredit {
  id: string;
  description: string;
  quantity: number;
  unitPrice: Numeric;
  total: Numeric;
  ivaRate: Numeric | null;
  saleOrderItemId: string | null;
}

export interface CreditableItem {
  invoiceItemId: string;
  description: string;
  quantity: number;
  creditableQuantity: number;
  /** Precio por unidad que se acredita (en crédito, sobre el total financiado). */
  unitPrice: number;
  ivaRate: number;
  saleOrderItemId: string | null;
}

/**
 * Lo que queda por acreditar de cada ítem. En una venta a crédito la factura
 * vale el total financiado, así que cada ítem se prorratea sobre ese total.
 */
export function creditableItems(
  invoiceTotal: number,
  items: InvoiceItemForCredit[],
  creditedQuantities: Map<string, number>,
): CreditableItem[] {
  const subtotal = items.reduce((sum, item) => sum + toNum(item.total), 0);
  const ratio = subtotal > 0 ? invoiceTotal / subtotal : 1;
  return items.map((item) => ({
    invoiceItemId: item.id,
    description: item.description,
    quantity: item.quantity,
    creditableQuantity: Math.max(
      item.quantity - (creditedQuantities.get(item.id) ?? 0),
      0,
    ),
    unitPrice: round2(toNum(item.unitPrice) * ratio),
    ivaRate: item.ivaRate == null ? 0 : toNum(item.ivaRate),
    saleOrderItemId: item.saleOrderItemId,
  }));
}

export interface CreditLine {
  invoiceItemId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  ivaRate: number;
  ivaAmount: number;
}

export interface CreditRequest {
  kind: CreditNoteKind;
  reason: string;
  items?: { invoiceItemId: string; quantity: number }[];
  amount?: number;
  ivaRate?: number;
}

function line(
  item: CreditableItem,
  quantity: number,
  total: number,
): CreditLine {
  return {
    invoiceItemId: item.invoiceItemId,
    description: item.description,
    quantity,
    unitPrice: item.unitPrice,
    total,
    ivaRate: item.ivaRate,
    ivaAmount: ivaIncluded(total, item.ivaRate),
  };
}

/**
 * Las líneas de la nota de crédito. Nunca acredita más de lo que queda de la
 * factura ni más unidades de las facturadas.
 */
export function buildCreditLines(
  request: CreditRequest,
  available: CreditableItem[],
  remaining: number,
): { lines: CreditLine[]; total: number } {
  if (remaining <= 0) {
    throw new UnprocessableEntityException(
      'La factura ya está acreditada por completo',
    );
  }

  let lines: CreditLine[];
  if (request.kind === 'TOTAL') {
    if (available.some((i) => i.creditableQuantity !== i.quantity)) {
      throw new UnprocessableEntityException(
        'La factura ya tiene notas de crédito: acreditá lo que queda por ítems o por importe',
      );
    }
    lines = available.map((item) =>
      line(item, item.quantity, round2(item.unitPrice * item.quantity)),
    );
    // El redondeo del prorrateo no puede dejar un resto sin acreditar.
    const drift = round2(remaining - lines.reduce((s, l) => s + l.total, 0));
    if (lines.length > 0 && drift !== 0) {
      const last = lines[lines.length - 1];
      last.total = round2(last.total + drift);
      last.ivaAmount = ivaIncluded(last.total, last.ivaRate);
    }
  } else if (request.kind === 'ITEMS') {
    const requested = request.items ?? [];
    if (requested.length === 0) {
      throw new UnprocessableEntityException(
        'Elegí al menos un ítem para acreditar',
      );
    }
    const seen = new Set<string>();
    lines = requested.map((req) => {
      const item = available.find((i) => i.invoiceItemId === req.invoiceItemId);
      if (!item) {
        throw new UnprocessableEntityException(
          'Uno de los ítems no es de esta factura',
        );
      }
      if (seen.has(req.invoiceItemId)) {
        throw new UnprocessableEntityException(
          `El ítem "${item.description}" está repetido`,
        );
      }
      seen.add(req.invoiceItemId);
      if (req.quantity < 1 || req.quantity > item.creditableQuantity) {
        throw new UnprocessableEntityException(
          `De "${item.description}" se pueden acreditar hasta ${item.creditableQuantity} unidades`,
        );
      }
      return line(item, req.quantity, round2(item.unitPrice * req.quantity));
    });
  } else {
    const amount = round2(request.amount ?? 0);
    if (amount <= 0) {
      throw new UnprocessableEntityException(
        'Cargá el importe de la nota de crédito',
      );
    }
    const rate = request.ivaRate ?? 10;
    if (![0, 5, 10].includes(rate)) {
      throw new UnprocessableEntityException(
        'La tasa de IVA es exenta, 5 % o 10 %',
      );
    }
    lines = [
      {
        invoiceItemId: null,
        description: `Descuento o bonificación: ${request.reason.trim()}`,
        quantity: 1,
        unitPrice: amount,
        total: amount,
        ivaRate: rate,
        ivaAmount: ivaIncluded(amount, rate),
      },
    ];
  }

  const total = round2(lines.reduce((sum, l) => sum + l.total, 0));
  if (total > round2(remaining) + 0.01) {
    throw new UnprocessableEntityException(
      `La nota de crédito (${total}) supera lo que queda por acreditar de la factura (${round2(remaining)})`,
    );
  }
  return { lines, total };
}

/** Primero se descuenta lo que el cliente debe; el resto es excedente. */
export function splitAgainstBalance(total: number, outstanding: number) {
  const applied = round2(Math.min(total, Math.max(outstanding, 0)));
  return { applied, excess: round2(total - applied) };
}
