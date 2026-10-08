'use client';

import { useState } from 'react';
import Link from 'next/link';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/api-error';
import {
  deliveryRoutesApi,
  type DeliveryRouteStatus,
  type RouteListQuery,
} from '@/lib/api/delivery-routes';
import { logisticsApi, type CourierOption } from '@/lib/api/logistics';
import { formatDatePY } from '@/lib/date';
import { progressLabel, ROUTE_STATUS_LABELS } from '@/lib/delivery-route';
import { usePermission } from '@/lib/permissions';
import { formatMoment } from '@/components/logistics/route-history';
import { RouteStatusBadge } from '@/components/logistics/route-status-badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
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

const PAGE_SIZE = 25;
const STATUSES = Object.keys(ROUTE_STATUS_LABELS) as DeliveryRouteStatus[];

export default function DeliveryRoutesPage() {
  const canPlan = usePermission('logistics:assign');
  const [status, setStatus] = useState<DeliveryRouteStatus | ''>('');
  const [driverId, setDriverId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const query: RouteListQuery = {
    page,
    limit: PAGE_SIZE,
    ...(status && { status }),
    ...(driverId && { driverEmployeeId: driverId }),
    ...(from && { from }),
    ...(to && { to }),
  };
  const routes = useQuery({
    queryKey: ['logistics-routes', query],
    queryFn: () => deliveryRoutesApi.list(query),
    placeholderData: keepPreviousData,
  });
  // El filtro por repartidor usa la misma lista que la asignación.
  const couriersQuery = useQuery({
    queryKey: ['logistics-couriers'],
    queryFn: logisticsApi.listCouriers,
    enabled: canPlan,
  });
  const couriers: CourierOption[] = couriersQuery.data ?? [];
  const driver = couriers.find((courier) => courier.id === driverId);

  // Cambiar un filtro vuelve a la primera página.
  const filter =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setPage(1);
    };
  const filtered = Boolean(status || driverId || from || to);
  const data = routes.data;

  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold">Rutas de entrega</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cada ruta es la salida de un repartidor. Se crea sola al asignarle una entrega desde{' '}
          <Link href="/dashboard/logistics/deliveries" className="underline underline-offset-4">
            Entregas
          </Link>
          .
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[12rem_16rem_11rem_11rem_auto] lg:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="route-status">Estado</Label>
          <Select
            value={status || 'all'}
            onValueChange={(value) =>
              filter(setStatus)(value && value !== 'all' ? (value as DeliveryRouteStatus) : '')
            }
          >
            <SelectTrigger id="route-status" className="w-full">
              <span className="flex-1 truncate text-left text-sm">
                {status ? ROUTE_STATUS_LABELS[status] : 'Todos'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {ROUTE_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canPlan && (
          <div className="space-y-1.5">
            <Label htmlFor="route-driver">Repartidor</Label>
            <Select
              value={driverId || 'all'}
              onValueChange={(value) => filter(setDriverId)(value && value !== 'all' ? value : '')}
            >
              <SelectTrigger id="route-driver" className="w-full">
                <span className="flex-1 truncate text-left text-sm">
                  {driver ? `${driver.firstName} ${driver.lastName}` : 'Todos'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {couriers.map((courier) => (
                  <SelectItem key={courier.id} value={courier.id}>
                    {courier.firstName} {courier.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="route-from">Desde</Label>
          <DatePicker id="route-from" value={from} onChange={filter(setFrom)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="route-to">Hasta</Label>
          <DatePicker id="route-to" value={to} onChange={filter(setTo)} />
        </div>
        {filtered && (
          <Button
            variant="ghost"
            onClick={() => {
              setStatus('');
              setDriverId('');
              setFrom('');
              setTo('');
              setPage(1);
            }}
          >
            Quitar filtros
          </Button>
        )}
      </div>

      {routes.isPending ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Cargando rutas…</p>
      ) : routes.isError ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {apiErrorMessage(routes.error, 'No se pudieron cargar las rutas.')}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void routes.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <p className="rounded-3xl bg-muted/40 px-4 py-12 text-center text-sm text-muted-foreground">
          {filtered
            ? 'No hay rutas con esos filtros.'
            : 'Todavía no hay rutas. Asigná una entrega a un repartidor y se crea la primera.'}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-3xl bg-card shadow-sm ring-1 ring-foreground/5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Repartidor</TableHead>
                  <TableHead>Vehículo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Entregas</TableHead>
                  <TableHead>Salió</TableHead>
                  <TableHead>Finalizó</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((route) => (
                  <TableRow key={route.id}>
                    <TableCell className="font-medium tabular-nums">
                      <Link
                        href={`/dashboard/logistics/routes/${route.id}`}
                        className="underline underline-offset-4"
                      >
                        {route.code}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatDatePY(route.date)}</TableCell>
                    <TableCell>
                      {route.driver
                        ? `${route.driver.firstName} ${route.driver.lastName}`
                        : 'Sin repartidor'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{route.vehicle ?? '—'}</TableCell>
                    <TableCell>
                      <RouteStatusBadge status={route.status} />
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {progressLabel({ total: route.stops, delivered: route.delivered })}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatMoment(route.startedAt)}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {route.status === 'CANCELLED' ? '—' : formatMoment(route.finishedAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <nav aria-label="Páginas" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground tabular-nums">
              Página {data.page} de {data.totalPages} · {data.total}{' '}
              {data.total === 1 ? 'ruta' : 'rutas'}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={data.page <= 1 || routes.isFetching}
                onClick={() => setPage(data.page - 1)}
              >
                <ChevronLeft aria-hidden />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={data.page >= data.totalPages || routes.isFetching}
                onClick={() => setPage(data.page + 1)}
              >
                Siguiente
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </nav>
        </>
      )}
    </div>
  );
}
