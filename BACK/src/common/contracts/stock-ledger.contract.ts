import type { Prisma } from '@prisma/client';
import type { StockDemand } from '../utils/stock-availability.util';

/** Línea de un pedido que mueve stock. */
export interface StockLine {
  saleItemId: string;
  productId: string | null;
  quantity: number;
  warehouseId: string | null;
  isSerialized: boolean;
}

/** Ítem ya guardado del que se pueden liberar reservas. */
export interface ReservedItem {
  id: string;
  productId: string | null;
  warehouseId?: string | null;
}

/**
 * Operaciones de stock que otros módulos (Ventas, POS) necesitan dentro de
 * su propia transacción. Las implementa Inventario: es el único módulo que
 * escribe stock_movements y product_units. Todas reciben el `tx` del llamador
 * para que el pedido y su movimiento de stock se confirmen o reviertan juntos.
 */
export const STOCK_LEDGER = Symbol('STOCK_LEDGER');

export interface StockLedger {
  /** Valida disponibilidad y bloquea los productos hasta el fin del tx. */
  assertAvailable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    demands: StockDemand[],
  ): Promise<void>;
  /** Movimiento RESERVED (negativo) por línea con producto. */
  reserve(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: StockLine[],
  ): Promise<void>;
  /** Movimiento OUT (negativo) por línea con producto. */
  consume(
    tx: Prisma.TransactionClient,
    tenantId: string,
    lines: StockLine[],
  ): Promise<void>;
  /** Reserva vigente por ítem (cantidad positiva). */
  findActiveReservations(
    tx: Prisma.TransactionClient,
    tenantId: string,
    itemIds: string[],
  ): Promise<Map<string, number>>;
  /** Revierte la reserva vigente de cada ítem, si tiene. */
  releaseReservations(
    tx: Prisma.TransactionClient,
    tenantId: string,
    items: ReservedItem[],
  ): Promise<void>;
  /** Asigna números de serie IN_STOCK a una línea de venta. */
  assignSerialUnits(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    serialNumbers: string[],
    saleItemId: string,
  ): Promise<void>;
  /** Desasigna las unidades de líneas que se van a reemplazar. */
  detachSerialUnits(
    tx: Prisma.TransactionClient,
    saleItemIds: string[],
  ): Promise<void>;
  /** Marca como vendidas las unidades asignadas a una línea. */
  markSerialUnitsSold(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleItemId: string,
  ): Promise<void>;
}
