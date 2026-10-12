'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowLeft, ArrowUp, MapPinOff, Navigation, Play } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import {
  deliveryRoutesApi,
  type DeliveryRouteDetail,
  type RouteStop,
} from '@/lib/api/delivery-routes';
import { logisticsApi, STATUS_LABELS, type CourierOption } from '@/lib/api/logistics';
import { formatDatePY, todayISODate } from '@/lib/date';
import {
  progressLabel,
  routeActions,
  routeDuration,
  routeMapLink,
  routeProgress,
} from '@/lib/delivery-route';
import { usePermission } from '@/lib/permissions';
import {
  bestInsertion,
  formatKm,
  formatMinutes,
  moveStop,
  nearestOrder,
  ROUTE_ASSUMPTIONS,
  routeEstimate,
} from '@/lib/route-plan';
import { FailDeliveryForm } from '@/components/logistics/fail-delivery-form';
import { OpenInMaps } from '@/components/logistics/open-in-maps';
import { formatMoment, RouteHistory } from '@/components/logistics/route-history';
import { RouteStatusBadge } from '@/components/logistics/route-status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

// Cuántas entregas sin ruta se ofrecen antes de pedir más.
const CANDIDATES_PAGE = 8;

const PANEL = 'rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5';

export default function DeliveryRoutePage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [failingId, setFailingId] = useState<string | null>(null);
  const canPlan = usePermission('logistics:assign');
  const canManage = usePermission('logistics:manage');

  const routeQuery = useQuery({
    queryKey: ['logistics-route', id],
    queryFn: () => deliveryRoutesApi.get(id),
  });

  const change = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onMutate: () => setError(null),
    onSuccess: () => setFailingId(null),
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar el cambio.')),
    // También ante un error: lo más probable es que la ruta haya cambiado.
    onSettled: () => {
      for (const key of ['logistics-route', 'logistics-routes', 'logistics-unplanned', 'logistics-deliveries']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
  const busy = change.isPending;

  if (routeQuery.isPending) {
    return <p className="p-6 py-16 text-center text-sm text-muted-foreground">Cargando la ruta…</p>;
  }
  if (routeQuery.isError) {
    return (
      <div className="p-6 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {apiErrorMessage(routeQuery.error, 'No se pudo cargar la ruta.')}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void routeQuery.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const route = routeQuery.data;
  const stops = route.stops;
  const ids = stops.map((stop) => stop.id);
  const points = stops.map((stop) => stop.customer);
  const estimate = routeEstimate(points);
  const progress = routeProgress(stops);
  const duration = routeDuration(route.startedAt, route.finishedAt);
  const actions = routeActions(
    { status: route.status, date: route.date, stops: stops.length, hasDriver: route.driver !== null },
    // El repartidor trabaja su ruta desde "Mis entregas".
    { canPlan, canManage, isDriver: false },
    todayISODate(),
  );
  const byNearest = nearestOrder(stops.map((stop) => ({ ...stop.customer, id: stop.id })));
  const alreadyNearest = byNearest.every((stopId, index) => stopId === ids[index]);
  const mapLink = routeMapLink(
    stops.filter((stop) => stop.status !== 'DELIVERED').map((stop) => stop.customer),
  );
  const rowActions = actions.reorder || actions.plan || actions.failStops;

  return (
    <div className="space-y-6 p-6">
      <Link
        href="/dashboard/logistics/routes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden />
        Rutas de entrega
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tabular-nums">{route.code}</h1>
            <RouteStatusBadge status={route.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {route.driver ? `${route.driver.firstName} ${route.driver.lastName}` : 'Sin repartidor'} ·{' '}
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
              Abrir recorrido en Google Maps
            </a>
          )}
          {actions.start && (
            <Button disabled={busy} onClick={() => change.mutate(() => deliveryRoutesApi.start(route.id))}>
              <Play aria-hidden />
              Iniciar ruta
            </Button>
          )}
          {actions.cancel && (
            <Button
              variant="ghost"
              className="text-destructive hover:text-destructive"
              disabled={busy}
              onClick={() => change.mutate(() => deliveryRoutesApi.cancel(route.id))}
            >
              Cancelar ruta
            </Button>
          )}
        </div>
      </header>

      {actions.startBlocked && (
        <p className="text-sm text-muted-foreground">Todavía no se puede iniciar: {actions.startBlocked}</p>
      )}
      {mapLink && mapLink.left > 0 && (
        <p className="text-xs text-muted-foreground">
          {mapLink.left === 1
            ? 'Una parada no entra en el enlace de Google Maps'
            : `${mapLink.left} paradas no entran en el enlace de Google Maps`}{' '}
          (sin ubicación ni dirección, o más de diez paradas). Abrilas una por una desde la tabla.
        </p>
      )}
      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Entregas" value={progressLabel(progress)} />
        <Metric label="Recorrido estimado" value={formatKm(estimate.km)} />
        <Metric label="Tiempo estimado" value={formatMinutes(estimate.totalMinutes)} />
        <Metric label="Salió" value={formatMoment(route.startedAt)} />
        <Metric
          label={route.status === 'CANCELLED' ? 'Cancelada' : 'Finalizó'}
          value={formatMoment(route.finishedAt)}
        />
        <Metric label="Duración real" value={duration ?? '—'} />
      </dl>

      <section aria-label="Paradas" className={PANEL}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-semibold">Paradas</h2>
              {actions.reorder && stops.length > 1 && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || alreadyNearest}
                  onClick={() => change.mutate(() => deliveryRoutesApi.reorder(route.id, byNearest))}
                >
                  Ordenar por cercanía
                </Button>
              )}
            </div>

            {estimate.unlocated > 0 && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <MapPinOff size={13} className="mt-0.5 shrink-0" aria-hidden />
                {estimate.unlocated === 1
                  ? 'Una parada no tiene ubicación cargada: su distancia no está contada.'
                  : `${estimate.unlocated} paradas no tienen ubicación cargada: su distancia no está contada.`}
              </p>
            )}

            {stops.length === 0 ? (
              <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
                {route.status === 'OPEN'
                  ? 'La ruta quedó sin entregas. Sumale desde la lista de abajo.'
                  : 'Esta ruta no tiene entregas.'}
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">#</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Dirección</TableHead>
                      <TableHead>Teléfono</TableHead>
                      <TableHead className="text-right">Unidades</TableHead>
                      <TableHead className="text-right">Tramo</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Mapa</TableHead>
                      {rowActions && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stops.map((stop, index) => {
                      const leg = estimate.legs[index];
                      const located = stop.customer.latitude !== null;
                      return (
                        <TableRow key={stop.id}>
                          <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                          <TableCell className="font-medium">{stop.customer.name}</TableCell>
                          <TableCell className="min-w-56 max-w-96 whitespace-normal text-muted-foreground">
                            {stop.customer.address ?? 'Sin dirección'}
                            {stop.customer.reference ? ` (${stop.customer.reference})` : ''}
                          </TableCell>
                          <TableCell className="tabular-nums">{stop.customer.phone ?? '—'}</TableCell>
                          <TableCell className="text-right tabular-nums">{stop.units}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {!located ? 'Sin ubicación' : leg === null ? '—' : `+${formatKm(leg)}`}
                          </TableCell>
                          <TableCell>{STATUS_LABELS[stop.status]}</TableCell>
                          <TableCell>
                            <OpenInMaps destination={stop.customer} size="xs" />
                          </TableCell>
                          {rowActions && (
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                {actions.reorder && (
                                  <>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={`Subir la parada de ${stop.customer.name}`}
                                      disabled={busy || index === 0}
                                      onClick={() =>
                                        change.mutate(() =>
                                          deliveryRoutesApi.reorder(route.id, moveStop(ids, stop.id, -1)),
                                        )
                                      }
                                    >
                                      <ArrowUp />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon-sm"
                                      aria-label={`Bajar la parada de ${stop.customer.name}`}
                                      disabled={busy || index === stops.length - 1}
                                      onClick={() =>
                                        change.mutate(() =>
                                          deliveryRoutesApi.reorder(route.id, moveStop(ids, stop.id, 1)),
                                        )
                                      }
                                    >
                                      <ArrowDown />
                                    </Button>
                                  </>
                                )}
                                {actions.plan && stop.status === 'PENDING' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy}
                                    onClick={() => change.mutate(() => deliveryRoutesApi.removeStop(stop.id))}
                                  >
                                    Sacar
                                  </Button>
                                )}
                                {actions.failStops && stop.status === 'DISPATCHED' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive"
                                    disabled={busy}
                                    onClick={() => setFailingId(stop.id)}
                                  >
                                    No se pudo entregar
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}

            {failingId && (
              <div className="mt-4">
                <FailDeliveryForm
                  key={failingId}
                  customerName={stops.find((stop) => stop.id === failingId)?.customer.name ?? ''}
                  busy={busy}
                  onCancel={() => setFailingId(null)}
                  onSubmit={(dto) => change.mutate(() => deliveryRoutesApi.failStop(failingId, dto))}
                />
              </div>
            )}

            <p className="mt-4 text-xs text-muted-foreground">
              Distancia y tiempo son una estimación: línea recta entre las ubicaciones guardadas de los
              clientes, corregida por las calles, a {ROUTE_ASSUMPTIONS.speedKmh} km/h y{' '}
              {formatMinutes(ROUTE_ASSUMPTIONS.minutesPerStop)} por parada. No cuenta el viaje desde el
              depósito.
            </p>
          </section>

      {/* Sin entregas para sumar, el historial ocupa todo el ancho. */}
      <div className={actions.addStops ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]" : "grid gap-6"}>
        <div className="space-y-6">
          {actions.addStops && (
            <AddDeliveries
              route={route}
              busy={busy}
              onAdd={(stop, position) =>
                change.mutate(() => deliveryRoutesApi.addStop(route.id, stop.id, position))
              }
            />
          )}
        </div>

        <div className="space-y-6">
          {actions.plan && (
            <RouteSettings
              key={`${route.driver?.id}-${route.date}-${route.vehicle}`}
              route={route}
              busy={busy}
              onSave={(dto) => change.mutate(() => deliveryRoutesApi.update(route.id, dto))}
            />
          )}
          <section aria-label="Historial" className={PANEL}>
            <h2 className="mb-4 text-base font-semibold">Historial</h2>
            <RouteHistory events={route.events} />
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium tabular-nums">{value}</dd>
    </div>
  );
}

/** Entregas sin ruta, de la que menos desvía a la que más. */
function AddDeliveries({
  route,
  busy,
  onAdd,
}: {
  route: DeliveryRouteDetail;
  busy: boolean;
  onAdd: (stop: RouteStop, position: number) => void;
}) {
  const [visible, setVisible] = useState(CANDIDATES_PAGE);
  const unplanned = useQuery({
    queryKey: ['logistics-unplanned'],
    queryFn: deliveryRoutesApi.unplanned,
  });
  const points = route.stops.map((stop) => stop.customer);
  const candidates = (unplanned.data ?? [])
    .map((stop) => ({ stop, cost: bestInsertion(points, stop.customer) }))
    .sort(
      (a, b) =>
        // Las que no tienen ubicación van al final: no se sabe cuánto desvían.
        Number(a.stop.customer.latitude === null) - Number(b.stop.customer.latitude === null) ||
        a.cost.extraKm - b.cost.extraKm,
    );

  return (
    <section aria-label="Sumar entregas" className={PANEL}>
      <h2 className="text-base font-semibold">Sumar entregas</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Envíos a domicilio pendientes que todavía no van en ninguna ruta, de la que menos desvía a la
        que más.
        {route.status === 'IN_PROGRESS' && ' La ruta ya salió: lo que sumes queda en camino en el acto.'}
      </p>

      {unplanned.isPending ? (
        <p className="mt-4 text-sm text-muted-foreground">Cargando entregas…</p>
      ) : unplanned.isError ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {apiErrorMessage(unplanned.error, 'No se pudieron cargar las entregas sin ruta.')}
        </p>
      ) : candidates.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No hay entregas esperando una ruta.
        </p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Dirección</TableHead>
                  <TableHead className="text-right">Unidades</TableHead>
                  <TableHead className="text-right">Desvío</TableHead>
                  <TableHead className="text-right">Tiempo</TableHead>
                  <TableHead className="text-right">Acción</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.slice(0, visible).map(({ stop, cost }) => (
                  <TableRow key={stop.id}>
                    <TableCell className="font-medium">{stop.customer.name}</TableCell>
                    <TableCell className="max-w-72 whitespace-normal text-muted-foreground">
                      {stop.customer.address ?? 'Sin dirección'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{stop.units}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {stop.customer.latitude === null ? 'Sin ubicación' : `+${formatKm(cost.extraKm)}`}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      +{formatMinutes(cost.extraMinutes)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        aria-label={`Sumar la entrega de ${stop.customer.name}`}
                        onClick={() => onAdd(stop, cost.position)}
                      >
                        Sumar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {candidates.length > visible && (
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 w-full"
              onClick={() => setVisible((current) => current + CANDIDATES_PAGE)}
            >
              Ver más ({candidates.length - visible} restantes)
            </Button>
          )}
        </>
      )}
    </section>
  );
}

/** Repartidor, fecha y vehículo de una ruta que todavía no salió. */
function RouteSettings({
  route,
  busy,
  onSave,
}: {
  route: DeliveryRouteDetail;
  busy: boolean;
  onSave: (dto: { driverEmployeeId?: string; date?: string; vehicle?: string }) => void;
}) {
  const [driverId, setDriverId] = useState(route.driver?.id ?? '');
  const [date, setDate] = useState(route.date);
  const [vehicle, setVehicle] = useState(route.vehicle ?? '');
  const couriersQuery = useQuery({ queryKey: ['logistics-couriers'], queryFn: logisticsApi.listCouriers });
  const couriers: CourierOption[] = couriersQuery.data ?? [];
  const driver = couriers.find((courier) => courier.id === driverId) ?? route.driver;

  const changes = {
    ...(driverId && driverId !== route.driver?.id && { driverEmployeeId: driverId }),
    ...(date && date !== route.date && { date }),
    ...(vehicle.trim() !== (route.vehicle ?? '') && { vehicle: vehicle.trim() }),
  };
  const dirty = Object.keys(changes).length > 0;

  return (
    <form
      aria-label="Datos de la ruta"
      className={`${PANEL} space-y-4`}
      onSubmit={(event) => {
        event.preventDefault();
        if (dirty) onSave(changes);
      }}
    >
      <h2 className="text-base font-semibold">Datos de la ruta</h2>
      <div className="space-y-1.5">
        <Label htmlFor="route-settings-driver">Repartidor</Label>
        <Select value={driverId || 'none'} onValueChange={(value) => setDriverId(value && value !== 'none' ? value : '')}>
          <SelectTrigger id="route-settings-driver" className="w-full">
            <span className="flex-1 truncate text-left text-sm">
              {driver ? `${driver.firstName} ${driver.lastName}` : 'Elegí un repartidor'}
            </span>
          </SelectTrigger>
          <SelectContent>
            {!route.driver && <SelectItem value="none">Elegí un repartidor</SelectItem>}
            {couriers.map((courier) => (
              <SelectItem key={courier.id} value={courier.id}>
                {courier.firstName} {courier.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="route-settings-date">Día de salida</Label>
        <DatePicker id="route-settings-date" value={date} onChange={(value) => value && setDate(value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="route-settings-vehicle">Vehículo</Label>
        <Input
          id="route-settings-vehicle"
          value={vehicle}
          maxLength={80}
          placeholder="Opcional"
          onChange={(event) => setVehicle(event.target.value)}
        />
      </div>
      <Button type="submit" size="sm" disabled={!dirty || busy}>
        Guardar cambios
      </Button>
    </form>
  );
}
