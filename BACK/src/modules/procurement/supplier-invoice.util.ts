// Factura del proveedor: la cuenta por pagar nace estimada al recibir
// (cantidad recibida × costo de la orden) y la factura la vuelve definitiva.
// Si la factura no coincide con lo recibido, alguien tiene que aprobar la
// diferencia antes de que cambie la deuda.

const round2 = (n: number) => Math.round(n * 100) / 100;
const CENT = 0.01;

/** Una línea de una recepción, tal como quedó registrada al recibir. */
export interface ReceivedLine {
  receiptItemId: string;
  payableId: string;
  quantity: number;
  unitCost: number;
}

/** Lo que la factura dice de esa línea. */
export interface InvoicedLine {
  receiptItemId: string;
  quantity: number;
  unitCost: number;
}

export type InvoiceDifference =
  | {
      kind: 'quantity' | 'price';
      receiptItemId: string;
      received: number;
      invoiced: number;
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
  const byPayable = new Map<string, { estimated: number; subtotal: number }>();

  for (const line of input.received) {
    const invoiced = invoicedById.get(line.receiptItemId) ?? {
      receiptItemId: line.receiptItemId,
      quantity: 0,
      unitCost: line.unitCost,
    };
    if (invoiced.quantity !== line.quantity) {
      differences.push({
        kind: 'quantity',
        receiptItemId: line.receiptItemId,
        received: line.quantity,
        invoiced: invoiced.quantity,
      });
    }
    if (Math.abs(invoiced.unitCost - line.unitCost) > CENT / 2) {
      differences.push({
        kind: 'price',
        receiptItemId: line.receiptItemId,
        received: line.unitCost,
        invoiced: invoiced.unitCost,
      });
    }
    const sums = byPayable.get(line.payableId) ?? { estimated: 0, subtotal: 0 };
    sums.estimated += line.quantity * line.unitCost;
    sums.subtotal += invoiced.quantity * invoiced.unitCost;
    byPayable.set(line.payableId, sums);
  }

  // El envío y el descuento nunca están en la estimación: siempre son una
  // diferencia que alguien tiene que mirar.
  if (input.shipping > 0) {
    differences.push({ kind: 'shipping', amount: round2(input.shipping) });
  }
  if (input.discount > 0) {
    differences.push({ kind: 'discount', amount: round2(input.discount) });
  }

  const groups = [...byPayable.entries()];
  const subtotal = round2(groups.reduce((sum, [, g]) => sum + g.subtotal, 0));
  const estimated = round2(groups.reduce((sum, [, g]) => sum + g.estimated, 0));
  const extra = round2(input.shipping - input.discount);
  const total = round2(subtotal + extra);

  // El envío y el descuento se reparten entre las cuentas en proporción a lo
  // facturado en cada una; el redondeo se lo lleva la última.
  const weights = groups.map(([, g]) =>
    subtotal > 0 ? g.subtotal : estimated > 0 ? g.estimated : 1,
  );
  const weightTotal = weights.reduce((sum, w) => sum + w, 0);
  let shared = 0;
  const payables = groups.map(([payableId, g], index) => {
    const isLast = index === groups.length - 1;
    const share = isLast
      ? round2(extra - shared)
      : round2((extra * weights[index]) / weightTotal);
    shared = round2(shared + share);
    return {
      payableId,
      estimated: round2(g.estimated),
      amount: round2(g.subtotal + share),
    };
  });

  return {
    subtotal,
    total,
    estimated,
    difference: round2(total - estimated),
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
  const amount = round2(input.amount);
  const excess = Math.max(0, round2(input.paidAmount - amount));
  const releasedAdvance = round2(Math.min(excess, input.advanceApplied));
  const overpaid = round2(excess - releasedAdvance);
  const paidAmount = round2(input.paidAmount - releasedAdvance);
  return {
    paidAmount,
    advanceApplied: round2(input.advanceApplied - releasedAdvance),
    status:
      paidAmount >= amount - CENT
        ? 'PAID'
        : paidAmount > 0
          ? 'PARTIAL'
          : 'PENDING',
    releasedAdvance,
    overpaid: overpaid > CENT ? overpaid : 0,
  };
}

const DAY_MS = 86_400_000;

/** Con factura, el plazo del proveedor corre desde la fecha de la factura. */
export function invoiceDueDate(invoiceDate: Date, paymentTermDays: number) {
  return new Date(
    invoiceDate.getTime() + Math.max(0, paymentTermDays) * DAY_MS,
  );
}
