'use client';

import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import { deliveryRoutesApi, type CreateRoutePayload } from '@/lib/api/delivery-routes';
import { logisticsApi, type CourierOption } from '@/lib/api/logistics';
import { formatDatePY, todayISODate } from '@/lib/date';
import { usePermission } from '@/lib/permissions';
import {
  formatMinutes,
  ROUTE_ASSUMPTIONS,
  shiftDay,
  SHIFTS,
  SHIFT_ORDER,
  weekdayName,
} from '@/lib/route-plan';
import { RouteCard, type RouteActions } from '@/components/logistics/route-card';
import { UnplannedDeliveries } from '@/components/logistics/unplanned-deliveries';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

export default function DeliveryRoutesPage() {
  const queryClient = useQueryClient();
  const today = todayISODate();
  const [day, setDay] = useState(today);
  const [error, setError] = useState<string | null>(null);
  const canPlan = usePermission('logistics:assign');
  // Un día que ya pasó se consulta, no se planifica.
  const canEdit = canPlan && day >= today;
  const nextDay = shiftDay(day < today ? today : day, 1);

  const board = useQuery({
    queryKey: ['logistics-routes', day],
    queryFn: () => deliveryRoutesApi.board(day),
    placeholderData: keepPreviousData,
  });
  const couriersQuery = useQuery({
    queryKey: ['logistics-couriers'],
    queryFn: logisticsApi.listCouriers,
    enabled: canPlan,
  });
  const couriers: CourierOption[] = couriersQuery.data ?? [];

  const change = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
    onMutate: () => setError(null),
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar el cambio.')),
    // También ante un error: lo más probable es que el tablero haya cambiado.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['logistics-routes'] });
      void queryClient.invalidateQueries({ queryKey: ['logistics-deliveries'] });
    },
  });
  const busy = change.isPending;

  const actions: RouteActions = {
    addStop: (routeId, noteId, position) =>
      change.mutate(() => deliveryRoutesApi.addStop(routeId, noteId, position)),
    reorder: (routeId, noteIds) => change.mutate(() => deliveryRoutesApi.reorder(routeId, noteIds)),
    removeStop: (noteId) => change.mutate(() => deliveryRoutesApi.removeStop(noteId)),
    schedule: (noteId, date, shift) =>
      change.mutate(() => deliveryRoutesApi.schedule(noteId, { date, shift })),
    updateRoute: (routeId, dto) => change.mutate(() => deliveryRoutesApi.update(routeId, dto)),
    removeRoute: (routeId) => change.mutate(() => deliveryRoutesApi.remove(routeId)),
  };

  const routes = board.data?.routes ?? [];

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Rutas de entrega</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Armá las salidas de cada turno y mirá si entran en su horario antes de sumarles entregas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Día anterior"
            onClick={() => setDay(shiftDay(day, -1))}
          >
            <ChevronLeft />
          </Button>
          <DatePicker value={day} onChange={(value) => value && setDay(value)} className="w-40" />
          <Button
            variant="outline"
            size="icon"
            aria-label="Día siguiente"
            onClick={() => setDay(shiftDay(day, 1))}
          >
            <ChevronRight />
          </Button>
          <Button variant="ghost" disabled={day === today} onClick={() => setDay(today)}>
            Hoy
          </Button>
        </div>
      </header>

      <p className="text-sm">
        <span className="font-medium capitalize">{weekdayName(day)}</span>{' '}
        <span className="text-muted-foreground">{formatDatePY(day)}</span>
        {day < today && (
          <span className="ml-2 text-muted-foreground">· Día pasado: solo consulta.</span>
        )}
      </p>

      {error && (
        <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {board.isPending ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Cargando rutas…</p>
      ) : board.isError ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {apiErrorMessage(board.error, 'No se pudieron cargar las rutas.')}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void board.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <div className="space-y-8">
            {SHIFT_ORDER.map((shift) => {
              const shiftRoutes = routes.filter((route) => route.shift === shift);
              return (
                <section key={shift} aria-label={`Turno ${SHIFTS[shift].label}`} className="space-y-3">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <h2 className="text-lg font-semibold">Turno {SHIFTS[shift].label.toLowerCase()}</h2>
                    <span className="text-sm text-muted-foreground tabular-nums">{SHIFTS[shift].hours}</span>
                    <span className="text-sm text-muted-foreground">
                      {shiftRoutes.length === 1 ? '1 ruta' : `${shiftRoutes.length} rutas`} ·{' '}
                      {shiftRoutes.reduce((sum, route) => sum + route.stops.length, 0)} entregas
                    </span>
                  </div>
                  {shiftRoutes.length === 0 && (
                    <p className="rounded-3xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
                      No hay rutas para este turno.
                    </p>
                  )}
                  {shiftRoutes.map((route) => (
                    <RouteCard
                      key={route.id}
                      route={route}
                      otherRoutes={routes.filter((other) => other.id !== route.id)}
                      couriers={couriers}
                      nextDay={nextDay}
                      canEdit={canEdit}
                      busy={busy}
                      actions={actions}
                    />
                  ))}
                  {canEdit && (
                    <NewRoute
                      couriers={couriers}
                      busy={busy}
                      onCreate={(dto) =>
                        change.mutate(() => deliveryRoutesApi.create({ ...dto, date: day, shift }))
                      }
                    />
                  )}
                </section>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Los tiempos son una estimación: distancia entre las ubicaciones guardadas de los clientes,
              a {ROUTE_ASSUMPTIONS.speedKmh} km/h de promedio y{' '}
              {formatMinutes(ROUTE_ASSUMPTIONS.minutesPerStop)} por parada. No cuentan el viaje desde el
              depósito ni el tránsito.
            </p>
          </div>
          <UnplannedDeliveries
            stops={board.data.unplanned}
            routes={routes}
            day={day}
            nextDay={nextDay}
            canEdit={canEdit}
            busy={busy}
            actions={actions}
          />
        </div>
      )}
    </div>
  );
}

function NewRoute({
  couriers,
  busy,
  onCreate,
}: {
  couriers: CourierOption[];
  busy: boolean;
  onCreate: (dto: Omit<CreateRoutePayload, 'date' | 'shift'>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [driverId, setDriverId] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [name, setName] = useState('');

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus aria-hidden />
        Nueva ruta
      </Button>
    );
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    onCreate({
      driverEmployeeId: driverId || undefined,
      vehicle: vehicle.trim() || undefined,
      name: name.trim() || undefined,
    });
    setOpen(false);
    setDriverId('');
    setVehicle('');
    setName('');
  }

  const driver = couriers.find((courier) => courier.id === driverId);

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5 md:grid-cols-[1fr_1fr_1fr_auto] md:items-end"
    >
      <div className="space-y-1.5">
        <Label htmlFor="new-route-driver">Repartidor</Label>
        <Select value={driverId || 'none'} onValueChange={(value) => setDriverId(value && value !== 'none' ? value : '')}>
          <SelectTrigger id="new-route-driver" className="w-full">
            <span className="flex-1 truncate text-left text-sm">
              {driver ? `${driver.firstName} ${driver.lastName}` : 'Sin repartidor por ahora'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sin repartidor por ahora</SelectItem>
            {couriers.map((courier) => (
              <SelectItem key={courier.id} value={courier.id}>
                {courier.firstName} {courier.lastName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-route-vehicle">Vehículo</Label>
        <Input
          id="new-route-vehicle"
          value={vehicle}
          maxLength={80}
          placeholder="Opcional"
          onChange={(event) => setVehicle(event.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="new-route-name">Nombre</Label>
        <Input
          id="new-route-name"
          value={name}
          maxLength={80}
          placeholder="Opcional: zona, recorrido…"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Crear ruta
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
