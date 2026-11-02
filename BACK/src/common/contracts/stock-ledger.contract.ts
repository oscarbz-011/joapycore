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

/** Mercadería devuelta por el cliente que vuelve al stock. */
export interface ReturnLine {
  saleItemId: string;
  quantity: number;
  serialNumbers: string[];
}

/** Qué se puede reingresar de una línea de venta. */
export interface ReturnableItem {
  stocked: boolean;
  isSerialized: boolean;
  soldSerials: string[];
}

/** Mercadería que pasa de un depósito a otro. */
export interface TransferLine {
  productId: string;
  quantity: number;
  serialNumbers: string[];
}

export interface StockTransfer {
  /** Documento que respalda el traslado (la nota de remisión). */
  referenceId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  notes: string;
  lines: TransferLine[];
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
    warehouseId: string,
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
  /** Por línea de venta: si mueve stock, si es serializada y sus N/S vendidos. */
  findReturnable(
    tx: Prisma.TransactionClient,
    tenantId: string,
    saleItemIds: string[],
  ): Promise<Map<string, ReturnableItem>>;
  /**
   * Reingresa lo devuelto: un IN por cantidad o las unidades elegidas de
   * vuelta a IN_STOCK. `referenceId` es el documento de la devolución.
   */
  restockReturn(
    tx: Prisma.TransactionClient,
    tenantId: string,
    referenceId: string,
    lines: ReturnLine[],
  ): Promise<void>;
  /**
   * Saca la mercadería del depósito de origen y la ingresa en el de destino:
   * un OUT y un IN por línea, y los serializados cambian de depósito.
   */
  transfer(
    tx: Prisma.TransactionClient,
    tenantId: string,
    transfer: StockTransfer,
  ): Promise<void>;
}
