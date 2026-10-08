'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigation, Phone, Play } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { deliveryRoutesApi, type DeliveryRoute } from '@/lib/api/delivery-routes';
import { STATUS_LABELS } from '@/lib/api/logistics';
import { formatDatePY, todayISODate } from '@/lib/date';
import { progressLabel, routeActions, routeMapLink, routeProgress } from '@/lib/delivery-route';
import { FailDeliveryForm } from './fail-delivery-form';
import { OpenInMaps } from './open-in-maps';
import { RouteStatusBadge } from './route-status-badge';
import { Button, buttonVariants } from '@/components/ui/button';

/** Las rutas del repartidor: qué lleva, a dónde y en qué orden. */
export function MyRoutes() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [failingId, setFailingId] = useState<string | null>(null);

  const routes = useQuery({
    queryKey: ['logistics-my-routes'],
    queryFn: deliveryRoutesApi.mine,
  });

  const change = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onMutate: () => setError(null),
    onSuccess: () => setFailingId(null),
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar el cambio.')),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['logistics-my-routes'] });
      void queryClient.invalidateQueries({ queryKey: ['logistics-mine'] });
    },
  });
  const busy = change.isPending;

  // Sin rutas no se muestra nada: la lista de entregas de abajo alcanza.
  if (!routes.data || routes.data.length === 0) return null;

  return (
    <section aria-label="Mis rutas" className="space-y-4">
      <h2 className="text-lg font-semibold">Mis rutas</h2>
      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      {routes.data.map((route) => (
        <MyRoute
          key={route.id}
          route={route}
          busy={busy}
          failingId={failingId}
          onFailing={setFailingId}
          onStart={() => change.mutate(() => deliveryRoutesApi.start(route.id))}
          onFail={(noteId, dto) => change.mutate(() => deliveryRoutesApi.failStop(noteId, dto))}
        />
      ))}
    </section>
  );
}

function MyRoute({
  route,
  busy,
  failingId,
  onFailing,
  onStart,
  onFail,
}: {
  route: DeliveryRoute;
  busy: boolean;
  failingId: string | null;
  onFailing: (noteId: string | null) => void;
  onStart: () => void;
  onFail: (noteId: string, dto: Parameters<typeof deliveryRoutesApi.failStop>[1]) => void;
}) {
  const actions = routeActions(
    { status: route.status, date: route.date, stops: route.stops.length, hasDriver: true },
    { canPlan: false, canManage: false, isDriver: true },
    todayISODate(),
  );
  const mapLink = routeMapLink(
    route.stops.filter((stop) => stop.status !== 'DELIVERED').map((stop) => stop.customer),
  );

  return (
    <article className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tabular-nums">{route.code}</h3>
            <RouteStatusBadge status={route.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {formatDatePY(route.date)} · {progressLabel(routeProgress(route.stops))}
            {route.vehicle ? ` · ${route.vehicle}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mapLink && (
            <a
              href={mapLink.url}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: 'outline', size: 'sm' })}
            >
              <Navigation aria-hidden />
              Recorrido en Google Maps
            </a>
          )}
          {actions.start && (
            <Button size="sm" disabled={busy} onClick={onStart}>
              <Play aria-hidden />
              Iniciar ruta
            </Button>
          )}
        </div>
      </header>
      {actions.startBlocked && (
        <p className="mt-2 text-sm text-muted-foreground">Todavía no se puede iniciar: {actions.startBlocked}</p>
      )}

      <ol className="mt-4 space-y-3">
        {route.stops.map((stop, index) => (
          <li key={stop.id} className="rounded-2xl bg-muted/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="font-medium">
                <span className="mr-2 tabular-nums text-muted-foreground">{index + 1}.</span>
                {stop.customer.name}
              </p>
              <span className="text-xs text-muted-foreground">{STATUS_LABELS[stop.status]}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {stop.customer.address ?? 'Sin dirección cargada'}
            </p>
            {stop.customer.reference && (
              <p className="text-sm text-muted-foreground">Referencia: {stop.customer.reference}</p>
            )}
            {stop.items.length > 0 && (
              <p className="mt-1 text-sm">
                {stop.items.map((item) => `${item.quantity} × ${item.name}`).join(' · ')}
              </p>
            )}

            {stop.status !== 'DELIVERED' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <OpenInMaps destination={stop.customer} />
                {stop.customer.phone && (
                  <a
                    href={`tel:${stop.customer.phone.replace(/\s+/g, '')}`}
                    className={buttonVariants({ variant: 'outline', size: 'sm' })}
                  >
                    <Phone aria-hidden />
                    {stop.customer.phone}
                  </a>
                )}
                {stop.status === 'DISPATCHED' && (
                  <Link
                    href={`/dashboard/logistics/mine/${stop.id}`}
                    className={buttonVariants({ size: 'sm' })}
                  >
                    Ver y entregar
                  </Link>
                )}
                {actions.failStops && stop.status === 'DISPATCHED' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={busy}
                    onClick={() => onFailing(stop.id)}
                  >
                    No se pudo entregar
                  </Button>
                )}
              </div>
            )}

            {failingId === stop.id && (
              <div className="mt-3">
                <FailDeliveryForm
                  customerName={stop.customer.name}
                  busy={busy}
                  onCancel={() => onFailing(null)}
                  onSubmit={(dto) => onFail(stop.id, dto)}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
    </article>
  );
}
