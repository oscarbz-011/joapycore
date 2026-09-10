// Emitido por ProductionOrdersService.complete(). Lo escucha inventory para
// generar los movimientos de stock: OUT por cada componente consumido, IN por
// el producto fabricado. Producción nunca escribe stock_movement directo.
export interface ProductionOrderCompletedEvent {
  tenantId: string;
  productionOrderId: string;
  /** Producto fabricado (entra al stock). */
  productId: string;
  quantity: number;
  warehouseId: string | null;
  /** Materia prima realmente consumida (sale del stock). */
  consumed: { productId: string; quantity: number }[];
}
