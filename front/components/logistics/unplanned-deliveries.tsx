'use client';

import { useState } from 'react';
import { MapPin, MapPinOff } from 'lucide-react';
import type { DeliveryRoute, RouteStop } from '@/lib/api/delivery-routes';
import { formatDatePY } from '@/lib/date';
import {
  bestInsertion,
  formatKm,
  groupUnplanned,
  loadSummary,
  routeTitle,
  SHIFTS,
  SHIFT_ORDER,
  type DeliveryShift,
} from '@/lib/route-plan';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import type { RouteActions } from './route-card';

// Cuántas entregas de un grupo se ven antes de pedir más.
const GROUP_PAGE = 8;

export function UnplannedDeliveries({
  stops,
  routes,
  day,
  nextDay,
  canEdit,
  busy,
  actions,
}: {
  stops: RouteStop[];
  /** Las rutas del día que se está planificando. */
  routes: DeliveryRoute[];
  day: string;
  nextDay: string;
  canEdit: boolean;
  busy: boolean;
  actions: RouteActions;
}) {
  const groups = groupUnplanned(stops, day);
  const sections: { key: string; title: string; hint?: string; items: RouteStop[] }[] = [
    { key: 'forDay', title: 'Programadas para este día', items: groups.forDay },
    {
      key: 'overdue',
      title: 'Atrasadas',
      hint: 'Estaban programadas para un día anterior y no salieron.',
      items: groups.overdue,
    },
    { key: 'undated', title: 'Sin fecha', items: groups.undated },
    { key: 'later', title: 'Programadas para más adelante', items: groups.later },
  ];

  return (
    <aside aria-label="Entregas sin ruta" className="rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5">
      <h2 className="text-base font-semibold">Entregas sin ruta</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Envíos a domicilio pendientes que todavía no van en ninguna ruta.
      </p>

      {stops.length === 0 ? (
        <p className="mt-4 rounded-2xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
          No hay entregas esperando una ruta.
        </p>
      ) : (
        sections
          .filter((section) => section.items.length > 0)
          .map((section) => (
            <Group key={section.key} title={section.title} hint={section.hint} count={section.items.length}>
              {(visible) =>
                section.items.slice(0, visible).map((stop) => (
                  <UnplannedItem
                    key={stop.id}
                    stop={stop}
                    routes={routes}
                    day={day}
                    nextDay={nextDay}
                    canEdit={canEdit}
                    busy={busy}
                    actions={actions}
                  />
                ))
              }
            </Group>
          ))
      )}
    </aside>
  );
}

function Group({
  title,
  hint,
  count,
  children,
}: {
  title: string;
  hint?: string;
  count: number;
  children: (visible: number) => React.ReactNode;
}) {
  const [visible, setVisible] = useState(GROUP_PAGE);
  return (
    <section className="mt-5">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        {title}
        <Badge variant="secondary">{count}</Badge>
      </h3>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      <ul className="mt-2 space-y-2">{children(visible)}</ul>
      {count > visible && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 w-full"
          onClick={() => setVisible((current) => current + GROUP_PAGE)}
        >
          Ver más ({count - visible} restantes)
        </Button>
      )}
    </section>
  );
}

function UnplannedItem({
  stop,
  routes,
  day,
  nextDay,
  canEdit,
  busy,
  actions,
}: {
  stop: RouteStop;
  routes: DeliveryRoute[];
  day: string;
  nextDay: string;
  canEdit: boolean;
  busy: boolean;
  actions: RouteActions;
}) {
  const located = stop.customer.latitude !== null;
  const options = routes.map((route) => ({
    route,
    cost: bestInsertion(
      route.stops.map((other) => other.customer),
      stop.customer,
      route.shift,
    ),
  }));

  function addTo(routeId: string | null) {
    const option = options.find((candidate) => candidate.route.id === routeId);
    if (option) actions.addStop(option.route.id, stop.id, option.cost.position);
  }

  function program(value: string | null) {
    if (!value || value === 'none') return;
    if (value === 'next') actions.schedule(stop.id, nextDay);
    else if (value === 'clear') actions.schedule(stop.id, null);
    else actions.schedule(stop.id, day, value as DeliveryShift);
  }

  return (
    <li className="rounded-2xl bg-muted/40 p-3 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-medium">{stop.customer.name}</p>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {stop.units} {stop.units === 1 ? 'unidad' : 'unidades'}
        </span>
      </div>
      <p className="mt-1 flex items-start gap-1.5 text-xs text-muted-foreground">
        {located ? (
          <MapPin size={13} className="mt-0.5 shrink-0" aria-hidden />
        ) : (
          <MapPinOff size={13} className="mt-0.5 shrink-0" aria-hidden />
        )}
        <span>
          {stop.customer.address ?? 'Sin dirección'}
          {!located && ' · sin ubicación en el mapa'}
        </span>
      </p>
      {stop.scheduledDate && (
        <p className="mt-1 text-xs text-muted-foreground">
          Programada: {formatDatePY(stop.scheduledDate)}
          {stop.scheduledShift ? ` · turno ${SHIFTS[stop.scheduledShift].label.toLowerCase()}` : ''}
        </p>
      )}

      {canEdit && (
        <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          <Select value="none" onValueChange={addTo} disabled={busy || routes.length === 0}>
            <SelectTrigger size="sm" className="w-full" aria-label={`Agregar a una ruta la entrega de ${stop.customer.name}`}>
              <span className="flex-1 truncate text-left text-sm">
                {routes.length === 0 ? 'No hay rutas este día' : 'Agregar a ruta…'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Agregar a ruta…</SelectItem>
              {options.map(({ route, cost }) => (
                <SelectItem key={route.id} value={route.id}>
                  {routeTitle(route)} ({SHIFTS[route.shift].label.toLowerCase()}) · +{formatKm(cost.extraKm)} ·{' '}
                  {loadSummary(cost).toLowerCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value="none" onValueChange={program} disabled={busy}>
            <SelectTrigger size="sm" className="w-full" aria-label={`Programar la entrega de ${stop.customer.name}`}>
              <span className="flex-1 truncate text-left text-sm">Programar…</span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Programar…</SelectItem>
              {SHIFT_ORDER.map((shift) => (
                <SelectItem key={shift} value={shift}>
                  Este día, turno {SHIFTS[shift].label.toLowerCase()}
                </SelectItem>
              ))}
              <SelectItem value="next">Día siguiente ({formatDatePY(nextDay)})</SelectItem>
              {stop.scheduledDate && <SelectItem value="clear">Dejar sin fecha</SelectItem>}
            </SelectContent>
          </Select>
        </div>
      )}
    </li>
  );
}
