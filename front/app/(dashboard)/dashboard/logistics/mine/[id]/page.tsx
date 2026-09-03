'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  MapPin,
  Package,
  Phone,
  Truck,
  User,
  Warehouse,
} from 'lucide-react';
import {
  logisticsApi,
  CHECKPOINT_LABELS,
  STATUS_LABELS,
  type DeliveryCheckpoint,
} from '../../../../../../lib/api/logistics';
import { formatDatePY } from '../../../../../../lib/date';
import { DeliveryMap } from '../../../../../../components/logistics/delivery-map';
import { CheckpointTimeline } from '../../../../../../components/logistics/checkpoint-timeline';
import { DeliverModal } from '../../../../../../components/logistics/deliver-modal';
import { formatDeliveryAddress, CHECKPOINT_ORDER } from '../page';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const CHECKPOINT_ICON: Record<DeliveryCheckpoint, React.ElementType> = {
  LEFT_WAREHOUSE: Warehouse,
  IN_TRANSIT: Truck,
  ARRIVED: MapPin,
  DELIVERED: CheckCircle2,
};

const STATUS_BADGE: Record<string, string> = {
  PENDING:    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  DISPATCHED: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  DELIVERED:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED:  'bg-muted/30 text-muted-foreground',
};

export default function MyDeliveryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [delivering, setDelivering] = useState(false);
  const back = () => router.push('/dashboard/logistics/mine');

  // Sin filtro de estado — a diferencia de la lista, el detalle tiene que
  // poder abrirse sin importar en qué pestaña estabas antes.
  const { data: notes, isLoading, isError } = useQuery({
    queryKey: ['logistics-mine'],
    queryFn: () => logisticsApi.listMine(),
  });
  const note = notes?.find((n) => n.id === id);

  const checkpointMutation = useMutation({
    mutationFn: (checkpoint: DeliveryCheckpoint) => logisticsApi.recordTrackingEvent(id, { checkpoint }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['logistics-mine'] });
    },
  });

  const dispatchMutation = useMutation({
    mutationFn: () => logisticsApi.dispatch(id, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['logistics-mine'] });
    },
  });

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando...</div>;
  }

  if (isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-destructive">Error al cargar la entrega.</p>
        <button type="button" onClick={back} className="mt-3 text-sm font-medium text-foreground underline underline-offset-2">
          Volver a mis entregas
        </button>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground/60">Entrega no encontrada.</p>
        <button type="button" onClick={back} className="mt-3 text-sm font-medium text-foreground underline underline-offset-2">
          Volver a mis entregas
        </button>
      </div>
    );
  }

  const customer = note.saleOrder.customer;
  const fullName = `${customer.firstName} ${customer.lastName}`;
  const address = formatDeliveryAddress(customer);
  const hasCoords = customer.latitude != null && customer.longitude != null;
  const completed = new Set(note.trackingEvents.map((e) => e.checkpoint));
  const nextCheckpoint = CHECKPOINT_ORDER.find((c) => !completed.has(c));

  return (
    <div>
      {delivering && <DeliverModal note={note} onClose={() => setDelivering(false)} />}

      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={back}>
          <ArrowLeft size={18} />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-foreground truncate">{fullName}</h1>
            <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_BADGE[note.status])}>
              {STATUS_LABELS[note.status]}
            </span>
          </div>
          <p className="text-xs text-muted-foreground/60">
            #{note.saleOrder.id.slice(0, 8).toUpperCase()} · {formatDatePY(note.issuedAt, 'local')}
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <Card className="p-4 space-y-2">
            {note.saleOrder.seller && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <User size={13} /> Vendedor: {note.saleOrder.seller.firstName} {note.saleOrder.seller.lastName}
              </p>
            )}
            {address && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin size={13} /> {address}
              </p>
            )}
            {customer.phone && (
              <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Phone size={13} /> {customer.phone}
              </p>
            )}
          </Card>

          {hasCoords ? (
            <DeliveryMap latitude={customer.latitude!} longitude={customer.longitude!} height={280} />
          ) : (
            <Card className="p-4">
              <p className="text-xs text-muted-foreground/60 italic">
                Sin ubicación del cliente registrada — se completa cuando confirmás o corregís la ubicación al entregar.
              </p>
            </Card>
          )}

          <Card className="p-4 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Productos</p>
            {note.saleOrder.items.map((item) => (
              <p key={item.id} className="text-sm text-foreground flex items-center gap-1.5">
                <Package size={13} className="text-muted-foreground/60" />
                {item.quantity}× {item.product.name}
              </p>
            ))}
          </Card>

          {note.notes && (
            <Card className="p-4">
              <p className="text-xs text-muted-foreground/60 italic">{note.notes}</p>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          {note.status === 'PENDING' && (
            <Card className="p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Acciones</p>
              <Button
                size="sm"
                className="w-full"
                onClick={() => dispatchMutation.mutate()}
                disabled={dispatchMutation.isPending}
              >
                <Truck size={13} />
                {dispatchMutation.isPending ? 'Despachando…' : 'Despachar'}
              </Button>
            </Card>
          )}

          {note.status === 'DISPATCHED' && (
            <Card className="p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Acciones</p>
              {nextCheckpoint && (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full"
                  onClick={() => checkpointMutation.mutate(nextCheckpoint)}
                  disabled={checkpointMutation.isPending}
                >
                  {(() => { const Icon = CHECKPOINT_ICON[nextCheckpoint]; return <Icon size={13} />; })()}
                  {CHECKPOINT_LABELS[nextCheckpoint]}
                </Button>
              )}
              <Button
                size="sm"
                className="w-full bg-emerald-600 hover:bg-emerald-700"
                onClick={() => setDelivering(true)}
              >
                <CheckCircle2 size={13} />
                Confirmar y entregar
              </Button>
            </Card>
          )}

          {note.trackingEvents.length > 0 && (
            <Card className="p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">Seguimiento</p>
              <CheckpointTimeline events={note.trackingEvents} />
            </Card>
          )}

          {note.deliveredAt && (
            <p className="text-xs text-emerald-600 font-medium">
              Entregado el {formatDatePY(note.deliveredAt, 'local')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
