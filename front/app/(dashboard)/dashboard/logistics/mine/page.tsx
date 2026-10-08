'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigation, Play, Truck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { deliveryRoutesApi } from '@/lib/api/delivery-routes';
import { logisticsApi, type DeliveryNote } from '@/lib/api/logistics';
import { formatDatePY, todayISODate } from '@/lib/date';
import { progressLabel, routeActions, routeMapLink, routeProgress } from '@/lib/delivery-route';
import {
  cardFromNote,
  cardFromStop,
  organizeMyWork,
  type MyRouteGroup,
} from '@/lib/my-deliveries';
import { DeliverModal } from '@/components/logistics/deliver-modal';
import {
  MyDeliveryCard,
  type DeliveryCardActions,
} from '@/components/logistics/my-delivery-card';
import { RouteStatusBadge } from '@/components/logistics/route-status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Tab = 'todo' | 'done';

// Cuántas entregas hechas se ven antes de pedir más.
const DONE_PAGE = 15;

const PANEL = 'rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5';

export default function MyDeliveriesPage() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('todo');
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
        {(
          [
            ['todo', 'Por hacer'],
            ['done', 'Entregadas'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors',
              tab === value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {tab === 'done' ? (
        <Delivered />
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
      ) : work.routes.length === 0 && work.loose.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-20 text-muted-foreground">
          <Truck size={36} className="opacity-30" aria-hidden />
          <p className="text-sm">No tenés entregas asignadas por ahora.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {work.routes.map((group) => (
            <RouteSection
              key={group.route.id}
              group={group}
              busy={busy}
              failingId={failingId}
              onFailing={setFailingId}
              onStart={() => change.mutate(() => deliveryRoutesApi.start(group.route.id))}
              actions={actions}
            />
          ))}

          {work.loose.length > 0 && (
            <section aria-label="Entregas sin ruta" className={PANEL}>
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
      )}
    </div>
  );
}

/** Una ruta del repartidor con sus paradas en el orden del recorrido. */
function RouteSection({
  group,
  busy,
  failingId,
  onFailing,
  onStart,
  actions,
}: {
  group: MyRouteGroup;
  busy: boolean;
  failingId: string | null;
  onFailing: (noteId: string | null) => void;
  onStart: () => void;
  actions: DeliveryCardActions;
}) {
  const { route, stops } = group;
  const progress = routeProgress(route.stops);
  const can = routeActions(
    { status: route.status, date: route.date, stops: route.stops.length, hasDriver: true },
    { canPlan: false, canManage: false, isDriver: true },
    todayISODate(),
  );
  const mapLink = routeMapLink(
    route.stops.filter((stop) => stop.status !== 'DELIVERED').map((stop) => stop.customer),
  );
  const percent = progress.total === 0 ? 0 : Math.round((progress.delivered / progress.total) * 100);

  return (
    <section aria-label={`Ruta ${route.code}`} className={PANEL}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-semibold tabular-nums">Ruta {route.code}</h2>
            <RouteStatusBadge status={route.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDatePY(route.date)}
            {route.vehicle ? ` · ${route.vehicle}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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
          {can.start && (
            <Button disabled={busy} onClick={onStart}>
              <Play aria-hidden />
              Iniciar ruta
            </Button>
          )}
        </div>
      </header>

      {can.startBlocked && (
        <p className="mt-2 text-sm text-muted-foreground">Todavía no se puede iniciar: {can.startBlocked}</p>
      )}

      <div className="mt-4">
        <p className="text-sm tabular-nums">{progressLabel(progress)}</p>
        <div
          role="progressbar"
          aria-label="Avance de la ruta"
          aria-valuemin={0}
          aria-valuemax={progress.total}
          aria-valuenow={progress.delivered}
          className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <ol className="mt-4 space-y-3">
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
    </section>
  );
}

/** Lo que el repartidor ya entregó, de lo más reciente a lo más viejo. */
function Delivered() {
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
        <p className="text-sm">Todavía no entregaste ningún pedido.</p>
      </div>
    );
  }

  return (
    <section aria-label="Entregadas" className={PANEL}>
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
