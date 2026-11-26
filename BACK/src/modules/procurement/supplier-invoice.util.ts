import { qty } from '../../common/units/quantity';
import type { QuantityValue } from '../../common/units/quantity';
// Factura del proveedor: la cuenta por pagar nace estimada al recibir
// (cantidad recibida × costo de la orden) y la factura la vuelve definitiva.
// Si la factura no coincide con lo recibido, alguien tiene que aprobar la
// diferencia antes de que cambie la deuda.

import { Prisma } from '@prisma/client';
import {
  money,
  roundCents,
  sumMoney,
  type Money,
} from '../../common/money/money';

// Las cuentas van con Decimal; hacia afuera viajan números, redondeados a
// centavos como antes.
const cents = (value: Money) => roundCents(value).toNumber();

/** Una línea de una recepción, tal como quedó registrada al recibir. */
export interface ReceivedLine {
  receiptItemId: string;
  payableId: string;
  quantity: QuantityValue;
  unitCost: number;
}

/** Lo que la factura dice de esa línea. */
export interface InvoicedLine {
  receiptItemId: string;
  quantity: QuantityValue;
  unitCost: number;
}

export type InvoiceDifference =
  | {
      kind: 'quantity' | 'price';
      receiptItemId: string;
      received: QuantityValue;
      invoiced: QuantityValue;
    }
  | { kind: 'shipping' | 'discount'; amount: number };

export interface InvoiceComparison {
  /** Suma de las líneas facturadas. */
  subtotal: number;
  /** Subtotal + envío − descuento: lo que el proveedor cobra. */
  total: number;
  /** Lo que se había estimado al recibir. */
  estimated: number;
  /** total − estimated; positivo = la factura es más cara. */
  difference: number;
  differences: InvoiceDifference[];
  /** Cuánto de la factura le toca a cada cuenta por pagar. */
  payables: { payableId: string; estimated: number; amount: number }[];
}

/**
 * Compara la factura con lo recibido. Una línea recibida que la factura no
 * trae cuenta como facturada en cero: es una diferencia, no un olvido que se
 * pueda pasar por alto.
 */
export function compareInvoice(input: {
  received: readonly ReceivedLine[];
  invoiced: readonly InvoicedLine[];
  shipping: number;
  discount: number;
}): InvoiceComparison {
  const invoicedById = new Map(
    input.invoiced.map((line) => [line.receiptItemId, line]),
  );
  const differences: InvoiceDifference[] = [];
  const byPayable = new Map<string, { estimated: Money; subtotal: Money }>();

  for (const line of input.received) {
    const invoiced = invoicedById.get(line.receiptItemId) ?? {
      receiptItemId: line.receiptItemId,
      quantity: 0,
      unitCost: line.unitCost,
    };
    if (!qty(invoiced.quantity).eq(line.quantity)) {
      differences.push({
        kind: 'quantity',
        receiptItemId: line.receiptItemId,
        received: line.quantity,
        invoiced: invoiced.quantity,
      });
    }
    if (!roundCents(invoiced.unitCost).equals(roundCents(line.unitCost))) {
      differences.push({
        kind: 'price',
        receiptItemId: line.receiptItemId,
        received: line.unitCost,
        invoiced: invoiced.unitCost,
      });
    }
    const sums = byPayable.get(line.payableId) ?? {
      estimated: money(0),
      subtotal: money(0),
    };
    sums.estimated = sums.estimated.plus(
      money(line.unitCost).mul(line.quantity),
    );
    sums.subtotal = sums.subtotal.plus(
      money(invoiced.unitCost).mul(invoiced.quantity),
    );
    byPayable.set(line.payableId, sums);
  }

  // El envío y el descuento nunca están en la estimación: siempre son una
  // diferencia que alguien tiene que mirar.
  if (input.shipping > 0) {
    differences.push({
      kind: 'shipping',
      amount: cents(money(input.shipping)),
    });
  }
  if (input.discount > 0) {
    differences.push({
      kind: 'discount',
      amount: cents(money(input.discount)),
    });
  }

  const groups = [...byPayable.entries()];
  const subtotal = roundCents(sumMoney(groups.map(([, g]) => g.subtotal)));
  const estimated = roundCents(sumMoney(groups.map(([, g]) => g.estimated)));
  const extra = roundCents(money(input.shipping).minus(money(input.discount)));
  const total = subtotal.plus(extra);

  // El envío y el descuento se reparten entre las cuentas en proporción a lo
  // facturado en cada una; el redondeo se lo lleva la última.
  const weights = groups.map(([, g]) =>
    subtotal.gt(0) ? g.subtotal : estimated.gt(0) ? g.estimated : money(1),
  );
  const weightTotal = sumMoney(weights);
  let shared = money(0);
  const payables = groups.map(([payableId, g], index) => {
    const isLast = index === groups.length - 1;
    const share = isLast
      ? extra.minus(shared)
      : roundCents(extra.mul(weights[index]).div(weightTotal));
    shared = shared.plus(share);
    return {
      payableId,
      estimated: cents(g.estimated),
      amount: cents(g.subtotal.plus(share)),
    };
  });

  return {
    subtotal: subtotal.toNumber(),
    total: total.toNumber(),
    estimated: estimated.toNumber(),
    difference: total.minus(estimated).toNumber(),
    differences,
    payables,
  };
}

/** Toda diferencia con lo recibido pide aprobación; no hay tolerancia. */
export function requiresApproval(comparison: InvoiceComparison): boolean {
  return comparison.differences.length > 0;
}

export interface PayableAfterInvoice {
  paidAmount: number;
  advanceApplied: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID';
  /** Anticipo que vuelve a quedar a favor en la orden. */
  releasedAdvance: number;
  /** Pagado de más con pagos comunes: no se puede resolver solo. */
  overpaid: number;
}

/**
 * Cómo queda una cuenta cuando su monto pasa a ser el de la factura. Si ya
 * se había pagado más que la factura, lo que sobra del anticipo vuelve a la
 * orden como saldo a favor; lo que sobra de pagos comunes se informa.
 */
export function payableAfterInvoice(input: {
  amount: number;
  paidAmount: number;
  advanceApplied: number;
}): PayableAfterInvoice {
  const amount = roundCents(input.amount);
  const paid = roundCents(input.paidAmount);
  const over = paid.minus(amount);
  const excess = over.isNegative() ? money(0) : over;
  const releasedAdvance = Prisma.Decimal.min(
    excess,
    roundCents(input.advanceApplied),
  );
  const overpaid = excess.minus(releasedAdvance);
  const paidAmount = paid.minus(releasedAdvance);
  return {
    paidAmount: paidAmount.toNumber(),
    advanceApplied: roundCents(input.advanceApplied)
      .minus(releasedAdvance)
      .toNumber(),
    status: paidAmount.gte(amount)
      ? 'PAID'
      : paidAmount.gt(0)
        ? 'PARTIAL'
        : 'PENDING',
    releasedAdvance: releasedAdvance.toNumber(),
    overpaid: overpaid.toNumber(),
  };
}

const DAY_MS = 86_400_000;

/** Con factura, el plazo del proveedor corre desde la fecha de la factura. */
export function invoiceDueDate(invoiceDate: Date, paymentTermDays: number) {
  return new Date(
    invoiceDate.getTime() + Math.max(0, paymentTermDays) * DAY_MS,
  );
}
