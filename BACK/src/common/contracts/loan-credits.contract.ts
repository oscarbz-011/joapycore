import type { Prisma } from '@prisma/client';

/**
 * Lo que Facturación necesita del financiamiento de una venta a crédito al
 * acreditar o anular su factura. Lo implementa Finanzas dentro del `tx` de
 * Facturación.
 */
export const LOAN_CREDITS = Symbol('LOAN_CREDITS');

export interface LoanCredits {
  /**
   * Achica las cuotas pendientes desde la última hacia atrás, sin registrar
   * un cobro. Devuelve cuánto se descontó (0 si la venta no se financió).
   */
  applyCredit(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleOrderId: string,
    amount: number,
  ): Promise<number>;
  /** Deja sin saldo y cancela el financiamiento de una venta anulada. */
  cancel(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleOrderId: string,
  ): Promise<void>;
  /** ¿Se cobró alguna cuota del financiamiento de la venta? */
  hasCollected(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleOrderId: string,
  ): Promise<boolean>;
}
