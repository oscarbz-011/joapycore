'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, Navigation, Play, Truck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { deliveryRoutesApi } from '@/lib/api/delivery-routes';
import { CHECKPOINT_LABELS, logisticsApi, type DeliveryNote } from '@/lib/api/logistics';
import { formatDatePY, todayISODate } from '@/lib/date';
import { progressLabel, routeActions, routeMapLink, routeProgress } from '@/lib/delivery-route';
import {
  cardFromNote,
  cardFromStop,
  organizeMyWork,
  routeCheckpointToMark,
  splitMyWork,
  type MyRouteGroup,
  type MyTab,
  type MyTabWork,
  type RouteCheckpoint,
} from '@/lib/my-deliveries';
import { DeliverModal } from '@/components/logistics/deliver-modal';
import {
  MyDeliveryCard,
  type DeliveryCardActions,
} from '@/components/logistics/my-delivery-card';
import { RouteStatusBadge } from '@/components/logistics/route-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Tab = MyTab | 'done';

const TABS: { value: Tab; label: string }[] = [
  { value: 'assigned', label: 'Asignadas' },
  { value: 'inProgress', label: 'En curso' },
  { value: 'done', label: 'Completadas' },
];

const EMPTY: Record<MyTab, string> = {
  assigned: 'No tenés entregas asignadas esperando salir.',
  inProgress: 'No tenés entregas en curso.',
};

// Cuántas entregas completadas se ven antes de pedir más.
const DONE_PAGE = 15;

const PANEL = 'rounded-3xl bg-card shadow-sm ring-1 ring-foreground/5';

export default function MyDeliveriesPage() {
  const queryClient = useQueryClient();
  // null = todavía no eligió: se abre donde hay trabajo.
  const [chosenTab, setChosenTab] = useState<Tab | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failingId, setFailingId] = useState<string | null>(null);
  const [delivering, setDelivering] = useState<DeliveryNote | null>(null);

  const routes = useQuery({ queryKey: ['logistics-my-routes'], queryFn: deliveryRoutesApi.mine });
  const pending = useQuery({
    queryKey: ['logistics-mine', 'PENDING'],
    queryFn: () => logisticsApi.listMine('PENDING'),
  });
  const dispatched = useQuery({
    queryKey: ['logistics-mine', 'DISPATCHED'],
    queryFn: () => logisticsApi.listMine('DISPATCHED'),
  });
  const queries = [routes, pending, dispatched];
  const loading = queries.some((query) => query.isPending);
  const failed = queries.find((query) => query.isError);

  const change = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onMutate: () => setError(null),
    onSuccess: () => setFailingId(null),
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar el cambio.')),
    // También ante un error: lo más probable es que la lista haya cambiado.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['logistics-my-routes'] });
      void queryClient.invalidateQueries({ queryKey: ['logistics-mine'] });
    },
  });
  const busy = change.isPending;

  const actions: DeliveryCardActions = {
    deliver: setDelivering,
    checkpoint: (noteId, checkpoint) =>
      change.mutate(() => logisticsApi.recordTrackingEvent(noteId, { checkpoint })),
    dispatch: (noteId) => change.mutate(() => logisticsApi.dispatch(noteId, {})),
    fail: (noteId, dto) => change.mutate(() => deliveryRoutesApi.failStop(noteId, dto)),
  };

  const work = organizeMyWork(routes.data ?? [], [
    ...(dispatched.data ?? []),
    ...(pending.data ?? []),
  ]);
  const tabs = splitMyWork(work);
  // Lo que está en la calle manda; si no hay nada, lo que espera salir.
  const tab: Tab = chosenTab ?? (tabs.inProgress.count > 0 || tabs.assigned.count === 0 ? 'inProgress' : 'assigned');
  const counts: Partial<Record<Tab, number>> = {
    assigned: tabs.assigned.count,
    inProgress: tabs.inProgress.count,
  };

  return (
    <div className="space-y-6">
      {delivering && <DeliverModal note={delivering} onClose={() => setDelivering(null)} />}

      <header>
        <h1 className="text-2xl font-semibold text-foreground">Mis entregas</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {loading || failed
            ? 'Lo que tenés asignado para repartir.'
            : work.todo === 0
              ? 'No tenés entregas por hacer.'
              : work.todo === 1
                ? 'Tenés 1 entrega por hacer.'
                : `Tenés ${work.todo} entregas por hacer.`}
        </p>
      </header>

      <div role="tablist" aria-label="Entregas" className="flex gap-1 border-b border-border">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setChosenTab(value)}
            className={cn(
              '-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
            {!loading && !failed && counts[value] !== undefined && (
              <Badge variant={tab === value ? 'default' : 'secondary'}>{counts[value]}</Badge>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {tab === 'done' ? (
        <Completed />
      ) : loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Cargando tus entregas…</p>
      ) : failed ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {apiErrorMessage(failed.error, 'No se pudieron cargar tus entregas.')}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => queries.forEach((query) => void query.refetch())}
          >
            Reintentar
          </Button>
        </div>
      ) : (
        <TabContent
          key={tab}
          work={tabs[tab]}
          emptyText={EMPTY[tab]}
          busy={busy}
          failingId={failingId}
          onFailing={setFailingId}
          onStart={(routeId) => change.mutate(() => deliveryRoutesApi.start(routeId))}
          onCheckpoint={(routeId, checkpoint) =>
            change.mutate(() => deliveryRoutesApi.checkpoint(routeId, checkpoint))
          }
          actions={actions}
        />
      )}
    </div>
  );
}

function TabContent({
  work,
  emptyText,
  busy,
  failingId,
  onFailing,
  onStart,
  onCheckpoint,
  actions,
}: {
  work: MyTabWork;
  emptyText: string;
  busy: boolean;
  failingId: string | null;
  onFailing: (noteId: string | null) => void;
  onStart: (routeId: string) => void;
  onCheckpoint: (routeId: string, checkpoint: RouteCheckpoint) => void;
  actions: DeliveryCardActions;
}) {
  if (work.routes.length === 0 && work.loose.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
        <Truck size={36} className="opacity-30" aria-hidden />
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {work.routes.map((group) => (
        <RouteSection
          key={group.route.id}
          group={group}
          // Con una sola ruta no hay nada que plegar: se ve abierta.
          defaultOpen={work.routes.length === 1}
          busy={busy}
          failingId={failingId}
          onFailing={onFailing}
          onStart={() => onStart(group.route.id)}
          onCheckpoint={(checkpoint) => onCheckpoint(group.route.id, checkpoint)}
          actions={actions}
        />
      ))}

      {work.loose.length > 0 && (
        <section aria-label="Entregas sin ruta" className={cn(PANEL, 'p-5')}>
          <h2 className="text-base font-semibold">Entregas sin ruta</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Te las asignaron por separado: cada una se despacha y se entrega por su cuenta.
          </p>
          <ul className="mt-4 space-y-3">
            {work.loose.map((note) => (
              <MyDeliveryCard
                key={note.id}
                data={cardFromNote(note)}
                note={note}
                inRoute={false}
                canFail={false}
                busy={busy}
                failing={false}
                onFailing={() => undefined}
                actions={actions}
              />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/**
 * Una ruta del repartidor. El encabezado resume el avance y lleva las acciones
 * que valen para toda la ruta; las paradas se despliegan debajo.
 */
function RouteSection({
  group,
  defaultOpen,
  busy,
  failingId,
  onFailing,
  onStart,
  onCheckpoint,
  actions,
}: {
  group: MyRouteGroup;
  defaultOpen: boolean;
  busy: boolean;
  failingId: string | null;
  onFailing: (noteId: string | null) => void;
  onStart: () => void;
  onCheckpoint: (checkpoint: RouteCheckpoint) => void;
  actions: DeliveryCardActions;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { route, stops } = group;
  const stopsId = `route-stops-${route.id}`;
  const progress = routeProgress(route.stops);
  const can = routeActions(
    { status: route.status, date: route.date, stops: route.stops.length, hasDriver: true },
    { canPlan: false, canManage: false, isDriver: true },
    todayISODate(),
  );
  const mapLink = routeMapLink(
    route.stops.filter((stop) => stop.status !== 'DELIVERED').map((stop) => stop.customer),
  );
  const checkpoint = route.status === 'IN_PROGRESS' ? routeCheckpointToMark(group) : null;
  const percent = progress.total === 0 ? 0 : Math.round((progress.delivered / progress.total) * 100);

  return (
    <section aria-label={`Ruta ${route.code}`} className={PANEL}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={stopsId}
        onClick={() => setOpen((current) => !current)}
        className="flex w-full items-start justify-between gap-3 rounded-3xl p-5 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/30"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-base font-semibold tabular-nums">Ruta {route.code}</span>
            <RouteStatusBadge status={route.status} />
          </span>
          <span className="mt-0.5 block text-sm text-muted-foreground tabular-nums">
            {formatDatePY(route.date)}
            {route.vehicle ? ` · ${route.vehicle}` : ''} · {progressLabel(progress)}
          </span>
          <span
            role="progressbar"
            aria-label="Avance de la ruta"
            aria-valuemin={0}
            aria-valuemax={progress.total}
            aria-valuenow={progress.delivered}
            className="mt-3 block h-1.5 overflow-hidden rounded-full bg-muted"
          >
            <span
              className="block h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
          {open ? 'Ocultar paradas' : 'Ver paradas'}
          <ChevronDown
            size={16}
            aria-hidden
            className={cn('transition-transform', open && 'rotate-180')}
          />
        </span>
      </button>

      {/* Lo que vale para toda la ruta, a la vista aunque esté plegada. */}
      <div className="flex flex-wrap items-center gap-2 px-5 pb-5">
        {can.start && (
          <Button disabled={busy} onClick={onStart}>
            <Play aria-hidden />
            Iniciar ruta
          </Button>
        )}
        {checkpoint && (
          <Button disabled={busy} onClick={() => onCheckpoint(checkpoint)}>
            Marcar toda la ruta: {CHECKPOINT_LABELS[checkpoint].toLowerCase()}
          </Button>
        )}
        {mapLink && (
          <a
            href={mapLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: 'outline' })}
          >
            <Navigation aria-hidden />
            Ver recorrido en Google Maps
          </a>
        )}
        {can.startBlocked && (
          <p className="text-sm text-muted-foreground">Todavía no se puede iniciar: {can.startBlocked}</p>
        )}
      </div>

      {open && (
        <ol id={stopsId} className="space-y-3 border-t border-border p-5">
          {stops.map(({ stop, note }, index) => (
            <MyDeliveryCard
              key={stop.id}
              data={note ? cardFromNote(note) : cardFromStop(stop)}
              note={note}
              position={index + 1}
              inRoute
              canFail={can.failStops}
              busy={busy}
              failing={failingId === stop.id}
              onFailing={(failing) => onFailing(failing ? stop.id : null)}
              actions={actions}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Lo que el repartidor ya entregó, de lo más reciente a lo más viejo. */
function Completed() {
  const [visible, setVisible] = useState(DONE_PAGE);
  const delivered = useQuery({
    queryKey: ['logistics-mine', 'DELIVERED'],
    queryFn: () => logisticsApi.listMine('DELIVERED'),
  });

  if (delivered.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Cargando entregas…</p>;
  }
  if (delivered.isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {apiErrorMessage(delivered.error, 'No se pudieron cargar tus entregas.')}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void delivered.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const notes = [...delivered.data].sort((a, b) =>
    (b.deliveredAt ?? '').localeCompare(a.deliveredAt ?? ''),
  );
  if (notes.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
        <Truck size={36} className="opacity-30" aria-hidden />
        <p className="text-sm">Todavía no completaste ninguna entrega.</p>
      </div>
    );
  }

  return (
    <section aria-label="Completadas" className={cn(PANEL, 'p-5')}>
      <ul className="divide-y divide-border">
        {notes.slice(0, visible).map((note) => {
          const card = cardFromNote(note);
          return (
            <li key={note.id}>
              <Link
                href={`/dashboard/logistics/mine/${note.id}`}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3 hover:bg-muted/30"
              >
                <span className="min-w-0">
                  <span className="block font-medium">{card.customerName}</span>
                  <span className="block text-sm text-muted-foreground">
                    {card.address ?? 'Sin dirección cargada'}
                  </span>
                </span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {note.route ? `${note.route.code} · ` : ''}
                  {formatDatePY(note.deliveredAt, 'local')}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {notes.length > visible && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => setVisible((current) => current + DONE_PAGE)}
        >
          Ver más ({notes.length - visible} restantes)
        </Button>
      )}
    </section>
  );
}
