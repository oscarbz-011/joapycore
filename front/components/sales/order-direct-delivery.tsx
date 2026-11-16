'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api/api-error';
import { salesApi } from '@/lib/api/sales';
import { useAuth } from '@/lib/auth-context';
import { canDeliverDirectly } from '@/lib/order-delivery';
import type { SlotProps } from '@/modules/slot-types';
import { OrderDeliverySection } from './order-delivery-section';

/**
 * Sin Logística, la venta se marca entregada acá mismo, lo que descuenta el
 * stock. Con Logística activa, este lugar lo ocupa Logística.
 */
export function OrderDirectDelivery({
  order,
  onDelivered,
}: SlotProps['sale-order.delivery']) {
  const { jwtPayload } = useAuth();
  if (!canDeliverDirectly({ status: order.status, permissions: jwtPayload?.permissions ?? [] })) {
    return null;
  }
  return <DirectDelivery saleOrderId={order.id} onDelivered={onDelivered} />;
}

function DirectDelivery({
  saleOrderId,
  onDelivered,
}: {
  saleOrderId: string;
  onDelivered: () => void;
}) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const mutation = useMutation({
    mutationFn: () => salesApi.deliverOrder(saleOrderId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['stock-movements'] });
      onDelivered();
    },
  });

  return (
    <OrderDeliverySection>
      {confirming ? (
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
          <p className="text-xs text-muted-foreground">
            ¿El cliente ya tiene el pedido? Se descuenta del stock y no se puede deshacer.
          </p>
          {mutation.isError && (
            <p role="alert" className="text-xs text-destructive">
              {apiErrorMessage(mutation.error, 'No se pudo marcar como entregado')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
              {mutation.isPending ? 'Guardando...' : 'Sí, ya lo tiene'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => {
                mutation.reset();
                setConfirming(false);
              }}
            >
              Volver
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Pendiente de entrega.</p>
          <Button size="sm" onClick={() => setConfirming(true)}>
            Marcar como entregado
          </Button>
        </div>
      )}
    </OrderDeliverySection>
  );
}
