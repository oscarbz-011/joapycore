export interface ReceiptLine {
  installmentNumber: number;
  installment: {
    loanId: string;
    loan: {
      saleOrder: {
        invoice: {
          invoicePrefix: string | null;
          invoiceNumber: string | null;
        } | null;
        items: {
          description: string | null;
          product: { name: string } | null;
        }[];
      };
    };
  };
}

/**
 * Ítem y concepto de cada línea del recibo. Si cubre cuotas de varias ventas,
 * cada línea dice de qué factura y producto es, y los ítems se numeran en
 * orden; con una sola venta queda como siempre (el ítem es la cuota).
 */
export function receiptItemLabels(lines: ReceiptLine[]): [string, string][] {
  const severalSales =
    new Set(lines.map((line) => line.installment.loanId)).size > 1;
  return lines.map((line, index) => {
    const base = `Cuota N° ${line.installmentNumber}`;
    if (!severalSales) return [String(line.installmentNumber), base];
    const sale = line.installment.loan.saleOrder;
    const invoice = sale.invoice
      ? `Factura ${sale.invoice.invoicePrefix ?? ''}${sale.invoice.invoiceNumber ?? ''}`
      : null;
    const product =
      sale.items[0]?.product?.name ?? sale.items[0]?.description ?? null;
    return [
      String(index + 1),
      [base, invoice, product].filter(Boolean).join(' · '),
    ];
  });
}
