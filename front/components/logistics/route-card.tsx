'use client';

import { ArrowDown, ArrowUp, MapPinOff, Route as RouteIcon, Trash2 } from 'lucide-react';
import type { CourierOption } from '@/lib/api/logistics';
import { STATUS_LABELS } from '@/lib/api/logistics';
import type { DeliveryRoute, RouteStop } from '@/lib/api/delivery-routes';
import { formatDatePY } from '@/lib/date';
import {
  bestInsertion,
  formatKm,
  formatMinutes,
  loadSummary,
  moveStop,
  nearestOrder,
  routeEstimate,
  routeTitle,
  SHIFTS,
  type DeliveryShift,
  type RouteLoad,
} from '@/lib/route-plan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

/** Lo que la pantalla de rutas sabe hacer; cada acción refresca el tablero. */
export interface RouteActions {
  addStop: (routeId: string, noteId: string, position?: number) => void;
  reorder: (routeId: string, noteIds: string[]) => void;
  removeStop: (noteId: string) => void;
  schedule: (noteId: string, date: string | null, shift?: DeliveryShift | null) => void;
  updateRoute: (routeId: string, dto: { driverEmployeeId?: string | null }) => void;
  removeRoute: (routeId: string) => void;
}

const LOAD_BADGE: Record<RouteLoad, 'secondary' | 'outline' | 'destructive'> = {
  fits: 'secondary',
  tight: 'outline',
  over: 'destructive',
};

const points = (stops: RouteStop[]) => stops.map((stop) => stop.customer);

export function RouteCard({
  route,
  otherRoutes,
  couriers,
  nextDay,
  canEdit,
  busy,
  actions,
}: {
  route: DeliveryRoute;
  /** Las demás rutas del día, a las que se puede pasar una parada. */
  otherRoutes: DeliveryRoute[];
  couriers: CourierOption[];
  nextDay: string;
  canEdit: boolean;
  busy: boolean;
  actions: RouteActions;
}) {
  const estimate = routeEstimate(points(route.stops), route.shift);
  const ids = route.stops.map((stop) => stop.id);
  const started = route.stops.some((stop) => stop.status !== 'PENDING');
  const byNearest = nearestOrder(route.stops.map((stop) => ({ ...stop.customer, id: stop.id })));
  const alreadyNearest = byNearest.every((id, index) => id === ids[index]);

  function move(stop: RouteStop, target: string | null) {
    if (!target || target === 'none') return;
    if (target === 'unassign') actions.removeStop(stop.id);
    else if (target === 'next') actions.schedule(stop.id, nextDay);
    else {
      const other = otherRoutes.find((candidate) => candidate.id === target);
      if (!other) return;
      const { position } = bestInsertion(points(other.stops), stop.customer, other.shift);
      actions.addStop(other.id, stop.id, position);
    }
  }

  return (
    <section
      aria-label={`Ruta ${routeTitle(route)}`}
      className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <RouteIcon size={16} className="shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{routeTitle(route)}</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {route.name && route.driver
              ? `${route.driver.firstName} ${route.driver.lastName}`
              : null}
            {route.name && route.driver && route.vehicle ? ' · ' : null}
            {route.vehicle}
          </p>
        </div>
        {route.stops.length > 0 && (
          <Badge variant={LOAD_BADGE[estimate.load]}>{loadSummary(estimate)}</Badge>
        )}
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Metric label="Paradas" value={String(estimate.stops)} />
        <Metric label="Recorrido" value={formatKm(estimate.km)} />
        <Metric
          label="Tiempo estimado"
          value={`${formatMinutes(estimate.totalMinutes)} de ${formatMinutes(estimate.shiftMinutes)}`}
        />
        <Metric
          label="Viaje / paradas"
          value={`${formatMinutes(estimate.travelMinutes)} / ${formatMinutes(estimate.stopMinutes)}`}
        />
      </dl>

      {estimate.unlocated > 0 && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
          <MapPinOff size={13} className="mt-0.5 shrink-0" aria-hidden />
          {estimate.unlocated === 1
            ? 'Una parada no tiene ubicación cargada: su distancia no está contada.'
            : `${estimate.unlocated} paradas no tienen ubicación cargada: su distancia no está contada.`}
        </p>
      )}

      {route.stops.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Todavía no tiene entregas. Sumale desde la lista de entregas sin ruta.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead className="text-right">Unidades</TableHead>
                <TableHead className="text-right">Tramo</TableHead>
                <TableHead>Estado</TableHead>
                {canEdit && <TableHead className="text-right">Acciones</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {route.stops.map((stop, index) => {
                const leg = estimate.legs[index];
                const located = stop.customer.latitude !== null;
                return (
                  <TableRow key={stop.id}>
                    <TableCell className="tabular-nums text-muted-foreground">{index + 1}</TableCell>
                    <TableCell className="font-medium">{stop.customer.name}</TableCell>
                    <TableCell className="max-w-64 whitespace-normal text-muted-foreground">
                      {stop.customer.address ?? 'Sin dirección'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{stop.units}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {!located ? 'Sin ubicación' : leg === null ? '—' : `+${formatKm(leg)}`}
                    </TableCell>
                    <TableCell>{STATUS_LABELS[stop.status]}</TableCell>
                    {canEdit && (
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Subir la parada de ${stop.customer.name}`}
                            disabled={busy || index === 0}
                            onClick={() => actions.reorder(route.id, moveStop(ids, stop.id, -1))}
                          >
                            <ArrowUp />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Bajar la parada de ${stop.customer.name}`}
                            disabled={busy || index === route.stops.length - 1}
                            onClick={() => actions.reorder(route.id, moveStop(ids, stop.id, 1))}
                          >
                            <ArrowDown />
                          </Button>
                          {stop.status === 'PENDING' && (
                            <Select value="none" onValueChange={(value) => move(stop, value)} disabled={busy}>
                              <SelectTrigger
                                size="sm"
                                className="w-28"
                                aria-label={`Mover la entrega de ${stop.customer.name}`}
                              >
                                <span className="flex-1 truncate text-left text-sm">Mover…</span>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Mover…</SelectItem>
                                {otherRoutes.map((other) => {
                                  const cost = bestInsertion(points(other.stops), stop.customer, other.shift);
                                  return (
                                    <SelectItem key={other.id} value={other.id}>
                                      A {routeTitle(other)} ({SHIFTS[other.shift].label.toLowerCase()}) · +
                                      {formatKm(cost.extraKm)} · {loadSummary(cost).toLowerCase()}
                                    </SelectItem>
                                  );
                                })}
                                <SelectItem value="next">
                                  Pasar al día siguiente ({formatDatePY(nextDay)})
                                </SelectItem>
                                <SelectItem value="unassign">Sacar de la ruta</SelectItem>
                              </SelectContent>
                            </Select>
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

      {canEdit && (
        <footer className="mt-4 flex flex-wrap items-center gap-2">
          <Select
            value={route.driver?.id ?? 'none'}
            onValueChange={(value) =>
              actions.updateRoute(route.id, {
                driverEmployeeId: value && value !== 'none' ? value : null,
              })
            }
            disabled={busy}
          >
            <SelectTrigger size="sm" className="w-56" aria-label="Repartidor de la ruta">
              <span className="flex-1 truncate text-left text-sm">
                {route.driver
                  ? `${route.driver.firstName} ${route.driver.lastName}`
                  : 'Sin repartidor'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Sin repartidor</SelectItem>
              {couriers.map((courier) => (
                <SelectItem key={courier.id} value={courier.id}>
                  {courier.firstName} {courier.lastName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            disabled={busy || alreadyNearest}
            onClick={() => actions.reorder(route.id, byNearest)}
          >
            Ordenar por cercanía
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-destructive hover:text-destructive"
            disabled={busy || started}
            title={started ? 'Ya tiene entregas en camino o entregadas' : undefined}
            onClick={() => actions.removeRoute(route.id)}
          >
            <Trash2 aria-hidden />
            Borrar ruta
          </Button>
        </footer>
      )}
    </section>
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
