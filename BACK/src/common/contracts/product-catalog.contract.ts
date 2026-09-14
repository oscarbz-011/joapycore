import type { Product } from '@prisma/client';

/**
 * Lectura de productos para módulos que no son Inventario (Ventas los
 * necesita para validar y precio). Lo implementa Inventario y se inyecta por
 * token: quien lo usa no importa InventoryModule ni sus repositorios.
 */
export const PRODUCT_CATALOG = Symbol('PRODUCT_CATALOG');

export interface ProductCatalog {
  findManyByIds(tenantId: string, ids: string[]): Promise<Product[]>;
}
