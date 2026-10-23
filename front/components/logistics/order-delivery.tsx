'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { apiErrorMessage } from '@/lib/api/api-error';
import { logisticsApi } from '@/lib/api/logistics';
import { salesApi, type SaleOrderStatus } from '@/lib/api/sales';
import { useAuth } from '@/lib/auth-context';
import { orderDeliveryMode } from '@/lib/order-delivery';
import { useActiveModules } from '@/lib/use-active-modules';
import { DeliveryMethodPanel } from './delivery-method-panel';

/**
 * La entrega de un pedido, vista desde la venta. Con Logística activa, el
 * vendedor dice si lo retira el cliente, pide llevarlo en persona, registra
 * el retiro o lo marca entregado. Sin Logística, la venta se marca entregada
 * acá mismo, lo que descuenta el stock.
 */
export function OrderDelivery({
  order,
  onDelivered,
}: {
  order: { id: string; status: SaleOrderStatus };
  onDelivered: () => void;
}) {
  const { jwtPayload } = useAuth();
  const { hasModule } = useActiveModules();
  const mode = orderDeliveryMode({
    status: order.status,
    logisticsActive: hasModule('logistics'),
    permissions: jwtPayload?.permissions ?? [],
  });

  if (mode === 'logistics') return <LogisticsDelivery saleOrderId={order.id} />;
  if (mode === 'direct') {
    return <DirectDelivery saleOrderId={order.id} onDelivered={onDelivered} />;
  }
  return null;
}

function Section({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-b border-border px-5 py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
        Entrega
      </p>
      {children}
    </div>
  );
}

function LogisticsDelivery({ saleOrderId }: { saleOrderId: string }) {
  const { data: note } = useQuery({
    queryKey: ['order-delivery', saleOrderId],
    queryFn: () => logisticsApi.getForOrder(saleOrderId),
    // 404 (sin entrega todavía) y 403 (no le corresponde) son respuestas
    // esperadas: no se reintentan ni se muestran como error.
    retry: false,
  });

  if (!note) return null;

  return (
    <Section>
      <DeliveryMethodPanel note={note} />
    </Section>
  );
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
    <Section>
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
    </Section>
  );
}
