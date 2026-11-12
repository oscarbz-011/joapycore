import type { ComponentType } from 'react';
import type { SaleOrderStatus } from '@/lib/api/sales';

/**
 * Lugares de una pantalla donde otro módulo puede agregar contenido, con lo
 * que la pantalla le pasa. El nombre dice de qué pantalla es cada uno.
 */
export interface SlotProps {
  /** La entrega del pedido, en el detalle de una venta. */
  'sale-order.delivery': {
    order: { id: string; status: SaleOrderStatus };
    onDelivered: () => void;
  };
}

export type SlotName = keyof SlotProps;

export type SlotContributions = {
  [K in SlotName]?: ComponentType<SlotProps[K]>;
};
