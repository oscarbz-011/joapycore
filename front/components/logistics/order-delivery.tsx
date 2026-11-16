'use client';

import { useQuery } from '@tanstack/react-query';
import { OrderDeliverySection } from '@/components/sales/order-delivery-section';
import { logisticsApi } from '@/lib/api/logistics';
import type { SlotProps } from '@/modules/slot-types';
import { DeliveryMethodPanel } from './delivery-method-panel';

/**
 * La entrega de un pedido vista desde la venta, cuando la maneja Logística:
 * el vendedor dice si lo retira el cliente, pide llevarlo en persona,
 * registra el retiro o lo marca entregado.
 */
export function LogisticsOrderDelivery({ order }: SlotProps['sale-order.delivery']) {
  const saleOrderId = order.id;
  const { data: note } = useQuery({
    queryKey: ['order-delivery', saleOrderId],
    queryFn: () => logisticsApi.getForOrder(saleOrderId),
    // 404 (sin entrega todavía) y 403 (no le corresponde) son respuestas
    // esperadas: no se reintentan ni se muestran como error.
    retry: false,
  });

  if (!note) return null;

  return (
    <OrderDeliverySection>
      <DeliveryMethodPanel note={note} />
    </OrderDeliverySection>
  );
}
