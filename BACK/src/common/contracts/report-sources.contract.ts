import type { Prisma } from '@prisma/client';

/**
 * Datos de otros módulos para los reportes, que son del núcleo y no tienen
 * datos propios. Cada contrato lo implementa el dueño de los datos y, con su
 * módulo apagado, devuelve una lista vacía.
 */

export const SALES_REPORT_INCLUDE = {
  customer: { select: { firstName: true, lastName: true } },
  items: {
    include: { product: { select: { name: true, categoryId: true } } },
  },
} satisfies Prisma.SaleOrderInclude;

export type SalesReportOrder = Prisma.SaleOrderGetPayload<{
  include: typeof SALES_REPORT_INCLUDE;
}>;

export const SALES_REPORT_SOURCE = Symbol('SALES_REPORT_SOURCE');

export interface SalesReportSource {
  /** Ventas cerradas del período, de la más vieja a la más nueva. */
  closedOrders(
    tenantId: string,
    range: { from?: Date; to?: Date },
  ): Promise<SalesReportOrder[]>;
}

export const STOCK_REPORT_INCLUDE = {
  category: { select: { name: true } },
  brand: { select: { name: true } },
  stockMovements: { select: { type: true, quantity: true } },
} satisfies Prisma.ProductInclude;

export type StockReportProduct = Prisma.ProductGetPayload<{
  include: typeof STOCK_REPORT_INCLUDE;
}>;

export const STOCK_REPORT_SOURCE = Symbol('STOCK_REPORT_SOURCE');

export interface StockReportSource {
  /** Productos vigentes con sus movimientos, por nombre. */
  productsWithMovements(tenantId: string): Promise<StockReportProduct[]>;
}

export const RECEIVABLES_REPORT_INCLUDE = {
  invoice: {
    include: {
      saleOrder: {
        include: {
          customer: true,
          // Para crédito, AR.dueDate queda fijo en la primera cuota: el
          // reporte recalcula el vencimiento con la cuota real sin pagar.
          loan: {
            select: {
              installments: {
                select: { dueDate: true, status: true },
                orderBy: { number: 'asc' },
              },
            },
          },
        },
      },
    },
  },
  paymentRecords: { select: { amount: true, paymentDate: true } },
} satisfies Prisma.AccountsReceivableInclude;

export type ReceivableReportRow = Prisma.AccountsReceivableGetPayload<{
  include: typeof RECEIVABLES_REPORT_INCLUDE;
}>;

export const RECEIVABLES_REPORT_SOURCE = Symbol('RECEIVABLES_REPORT_SOURCE');

export interface ReceivablesReportSource {
  /** Cuentas por cobrar, de la más nueva a la más vieja. */
  receivables(tenantId: string): Promise<ReceivableReportRow[]>;
}
