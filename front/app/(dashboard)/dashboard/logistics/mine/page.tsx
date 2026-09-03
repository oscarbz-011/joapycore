'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronRight,
  MapPin,
  Truck,
  Warehouse,
} from 'lucide-react';
import {
  logisticsApi,
  CHECKPOINT_LABELS,
  STATUS_LABELS,
  type DeliveryCheckpoint,
  type DeliveryNote,
  type DeliveryNoteStatus,
} from '../../../../../lib/api/logistics';
import type { Customer as DeliveryCustomer } from '../../../../../lib/api/sales';
import { formatDatePY } from '../../../../../lib/date';
import { DeliverModal } from '../../../../../components/logistics/deliver-modal';
import { cn } from '@/lib/utils';

// Compartido con mine/[id]/page.tsx — la dirección estructurada del cliente,
// mismo criterio que ya usa deliveries/page.tsx (saleOrder.deliveryAddress
// nunca existió en el schema).
export function formatDeliveryAddress(customer: DeliveryCustomer): string | null {
  const houseParts = [customer.homeStreet, customer.homeNeighborhood].filter(Boolean);
  const aptParts = [customer.aptBuilding, customer.aptFloor, customer.aptNumber].filter(Boolean);
  const structured = [...houseParts, ...aptParts].join(', ');
  if (structured) return structured;
  if (customer.address) return [customer.address, customer.city].filter(Boolean).join(', ');
  return null;
}

export const CHECKPOINT_ORDER: DeliveryCheckpoint[] = ['LEFT_WAREHOUSE', 'IN_TRANSIT', 'ARRIVED'];

const CHECKPOINT_ICON: Record<DeliveryCheckpoint, React.ElementType> = {
  LEFT_WAREHOUSE: Warehouse,
  IN_TRANSIT: Truck,
  ARRIVED: MapPin,
  DELIVERED: CheckCircle2,
};

const STATUS_BADGE: Record<DeliveryNoteStatus, string> = {
  PENDING:    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  DISPATCHED: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  DELIVERED:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED:  'bg-muted/30 text-muted-foreground',
};

// ── MyDeliveryRow — fila compacta, navega a la página de detalle ───────────────

function MyDeliveryRow({ note }: { note: DeliveryNote }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [delivering, setDelivering] = useState(false);
  const customer = note.saleOrder.customer;
  const fullName = `${customer.firstName} ${customer.lastName}`;
  const completed = new Set(note.trackingEvents.map((e) => e.checkpoint));
  const nextCheckpoint = CHECKPOINT_ORDER.find((c) => !completed.has(c));

  const checkpointMutation = useMutation({
    mutationFn: (checkpoint: DeliveryCheckpoint) => logisticsApi.recordTrackingEvent(note.id, { checkpoint }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['logistics-mine'] });
    },
  });

  // El repartidor asignado despacha su propia entrega (empieza el viaje)
  // sin depender de que un admin/despachador lo haga desde "Entregas" —
  // mismo endpoint que usa esa pantalla, el backend ahora acepta
  // logistics:manage (admin) O logistics:track + ser el asignado.
  const dispatchMutation = useMutation({
    mutationFn: () => logisticsApi.dispatch(note.id, {}),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['logistics-mine'] });
    },
  });

  return (
    <>
      {delivering && <DeliverModal note={note} onClose={() => setDelivering(false)} />}

      <div
        onClick={() => router.push(`/dashboard/logistics/mine/${note.id}`)}
        className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 cursor-pointer hover:bg-muted/20 transition-colors"
      >
        <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold', STATUS_BADGE[note.status])}>
          {STATUS_LABELS[note.status]}
        </span>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground truncate">{fullName}</p>
          <p className="text-xs text-muted-foreground/60">
            #{note.saleOrder.id.slice(0, 8).toUpperCase()} · {formatDatePY(note.issuedAt, 'local')}
          </p>
        </div>

        {note.status === 'PENDING' && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => dispatchMutation.mutate()}
              disabled={dispatchMutation.isPending}
              className="inline-flex items-center gap-1.5 rounded-xl bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Truck size={13} />
              {dispatchMutation.isPending ? 'Despachando…' : 'Despachar'}
            </button>
          </div>
        )}

        {note.status === 'DISPATCHED' && (
          <div className="flex flex-wrap items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
            {nextCheckpoint && (
              <button
                type="button"
                onClick={() => checkpointMutation.mutate(nextCheckpoint)}
                disabled={checkpointMutation.isPending}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-foreground/20 hover:text-foreground transition-colors disabled:opacity-50"
              >
                {(() => { const Icon = CHECKPOINT_ICON[nextCheckpoint]; return <Icon size={13} />; })()}
                {CHECKPOINT_LABELS[nextCheckpoint]}
              </button>
            )}
            <button
              type="button"
              onClick={() => setDelivering(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition-colors"
            >
              <CheckCircle2 size={13} />
              Confirmar y entregar
            </button>
          </div>
        )}

        <ChevronRight size={15} className="text-muted-foreground/40 shrink-0" />
      </div>
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TABS: { value: DeliveryNoteStatus; label: string }[] = [
  { value: 'PENDING',    label: 'Asignados' },
  { value: 'DISPATCHED', label: 'En curso' },
  { value: 'DELIVERED',  label: 'Entregados' },
];

export default function MyDeliveriesPage() {
  const [tab, setTab] = useState<DeliveryNoteStatus>('PENDING');

  const { data: notes = [], isLoading, isError } = useQuery({
    queryKey: ['logistics-mine', tab],
    queryFn: () => logisticsApi.listMine(tab),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Mis entregas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Entregas asignadas a vos</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground/60 text-sm">
          Cargando entregas…
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center py-16 text-destructive text-sm">
          Error al cargar tus entregas.
        </div>
      )}

      {!isLoading && !isError && notes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/60 gap-2">
          <Truck size={36} className="opacity-30" />
          <p className="text-sm">No tenés entregas en estado &quot;{TABS.find((t) => t.value === tab)?.label}&quot;.</p>
        </div>
      )}

      {!isLoading && !isError && notes.length > 0 && (
        <div className="space-y-2">
          {notes.map((note) => <MyDeliveryRow key={note.id} note={note} />)}
        </div>
      )}
    </div>
  );
}
