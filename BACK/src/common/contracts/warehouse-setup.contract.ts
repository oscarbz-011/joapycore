import type { Prisma } from '@prisma/client';

/**
 * Depósitos prepara el depósito por defecto de una empresa nueva dentro del
 * `tx` del registro.
 */
export const WAREHOUSE_SETUP = Symbol('WAREHOUSE_SETUP');

export interface WarehouseSetup {
  createMainWarehouse(
    tx: Prisma.TransactionClient,
    tenantId: string,
    branchId: string,
  ): Promise<{ id: string }>;
}
