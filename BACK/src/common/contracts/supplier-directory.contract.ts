/**
 * Proveedores para módulos que no son Compras (Inventario los asocia a sus
 * productos). Lo implementa Compras; con Compras apagado no hay proveedores.
 */
export const SUPPLIER_DIRECTORY = Symbol('SUPPLIER_DIRECTORY');

export interface SupplierDirectory {
  /** Null si no existe, está inactivo o Compras está apagado. */
  findActive(
    tenantId: string,
    supplierId: string,
  ): Promise<{ id: string } | null>;
}
