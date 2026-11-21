import type { Prisma } from '@prisma/client';

/**
 * Sucursales prepara la Casa Matriz de una empresa nueva dentro del `tx` del
 * registro: una empresa sin sucursal no puede operar.
 */
export const BRANCH_SETUP = Symbol('BRANCH_SETUP');

export interface BranchSetup {
  createHeadquarters(
    tx: Prisma.TransactionClient,
    tenantId: string,
  ): Promise<{ id: string }>;
}
