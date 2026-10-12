'use client';

import { useQuery } from '@tanstack/react-query';
import { logisticsApi } from '@/lib/api/logistics';
import { DeliveryMethodPanel } from './delivery-method-panel';

/**
 * La entrega de un pedido, vista desde la venta: acá el vendedor dice si lo
 * retira el cliente, pide llevarlo en persona, registra el retiro o lo marca
 * entregado. No muestra nada si el pedido todavía no tiene entrega o si quien
 * mira no es de logística ni el vendedor del pedido.
 */
export function OrderDelivery({ saleOrderId }: { saleOrderId: string }) {
  const { data: note } = useQuery({
    queryKey: ['order-delivery', saleOrderId],
    queryFn: () => logisticsApi.getForOrder(saleOrderId),
    // 404 (sin entrega todavía) y 403 (no le corresponde) son respuestas
    // esperadas: no se reintentan ni se muestran como error.
    retry: false,
  });

  if (!note) return null;

  return (
    <div className="border-b border-border px-5 py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        Entrega
      </p>
      <DeliveryMethodPanel note={note} />
    </div>
  );
}
