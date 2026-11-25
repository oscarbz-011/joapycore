import { UnprocessableEntityException } from '@nestjs/common';
import type { CreditNoteKind } from '@prisma/client';
import {
  money,
  roundGuaranies,
  sumMoney,
  type MoneyValue,
} from '../../../common/money/money';

// Las cuentas se hacen con Decimal; hacia afuera viajan números, exactos
// porque los montos son guaraníes enteros.
type Numeric = MoneyValue;

export const ivaIncluded = (total: MoneyValue, rate: MoneyValue) =>
  roundGuaranies(
    money(total).mul(money(rate)).div(money(rate).plus(100)),
  ).toNumber();

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
  invoiceTotal: MoneyValue,
  items: InvoiceItemForCredit[],
  creditedQuantities: Map<string, number>,
): CreditableItem[] {
  const subtotal = sumMoney(items.map((item) => item.total));
  const ratio = subtotal.gt(0) ? money(invoiceTotal).div(subtotal) : money(1);
  return items.map((item) => ({
    invoiceItemId: item.id,
    description: item.description,
    quantity: item.quantity,
    creditableQuantity: Math.max(
      item.quantity - (creditedQuantities.get(item.id) ?? 0),
      0,
    ),
    unitPrice: roundGuaranies(money(item.unitPrice).mul(ratio)).toNumber(),
    ivaRate: item.ivaRate == null ? 0 : money(item.ivaRate).toNumber(),
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
  const left = money(remaining);
  if (left.lte(0)) {
    throw new UnprocessableEntityException(
      'La factura ya está acreditada por completo',
    );
  }
  const times = (price: number, quantity: number) =>
    money(price).mul(quantity).toNumber();

  let lines: CreditLine[];
  if (request.kind === 'TOTAL') {
    if (available.some((i) => i.creditableQuantity !== i.quantity)) {
      throw new UnprocessableEntityException(
        'La factura ya tiene notas de crédito: acreditá lo que queda por ítems o por importe',
      );
    }
    lines = available.map((item) =>
      line(item, item.quantity, times(item.unitPrice, item.quantity)),
    );
    // El redondeo del prorrateo no puede dejar un resto sin acreditar.
    const drift = left.minus(sumMoney(lines.map((l) => l.total)));
    if (lines.length > 0 && !drift.isZero()) {
      const last = lines[lines.length - 1];
      last.total = money(last.total).plus(drift).toNumber();
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
      return line(item, req.quantity, times(item.unitPrice, req.quantity));
    });
  } else {
    const amount = roundGuaranies(request.amount ?? 0).toNumber();
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

  const total = sumMoney(lines.map((l) => l.total));
  if (total.gt(left)) {
    throw new UnprocessableEntityException(
      `La nota de crédito (${total.toString()}) supera lo que queda por acreditar de la factura (${left.toString()})`,
    );
  }
  return { lines, total: total.toNumber() };
}

/** Primero se descuenta lo que el cliente debe; el resto es excedente. */
export function splitAgainstBalance(
  total: MoneyValue,
  outstanding: MoneyValue,
) {
  const owed = money(outstanding);
  const applied = money(total).lt(owed.isNegative() ? 0 : owed)
    ? money(total)
    : owed.isNegative()
      ? money(0)
      : owed;
  return {
    applied: applied.toNumber(),
    excess: money(total).minus(applied).toNumber(),
  };
}
