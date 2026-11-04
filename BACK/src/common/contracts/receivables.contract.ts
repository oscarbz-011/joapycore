import type { Prisma } from '@prisma/client';

/** Cuenta por cobrar vigente de una factura. */
export interface ReceivableBalance {
  amount: number;
  paid: number;
  outstanding: number;
}

/**
 * Lo que Facturación necesita de las cuentas por cobrar al acreditar una
 * factura. Lo implementa Pagos y recibe el `tx` de Facturación para que la
 * nota de crédito y el descuento del saldo se confirmen juntos.
 */
export const RECEIVABLES = Symbol('RECEIVABLES');

export interface Receivables {
  /** Null si la factura no tiene cuenta por cobrar vigente. */
  balance(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
  ): Promise<ReceivableBalance | null>;
  /**
   * Baja el importe de la cuenta por cobrar. No es un cobro: no suma lo
   * pagado ni avisa que la cuenta quedó saldada.
   */
  applyCredit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    invoiceId: string,
    amount: number,
  ): Promise<void>;
}
