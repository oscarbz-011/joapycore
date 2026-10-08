import type { RouteEvent } from '@/lib/api/delivery-routes';
import { routeEventText } from '@/lib/delivery-route';

const WHEN = new Intl.DateTimeFormat('es-PY', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Asuncion',
});

/** "08/10, 14:32" en hora de Paraguay. */
export function formatMoment(iso: string | null): string {
  return iso ? WHEN.format(new Date(iso)) : '—';
}

/** Todo lo que le pasó a la ruta, del primer movimiento al último. */
export function RouteHistory({ events }: { events: RouteEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Todavía no hay movimientos.</p>;
  }
  return (
    <ol className="space-y-3">
      {events.map((event) => (
        <li key={event.id} className="border-l-2 border-border pl-3">
          <p className="text-sm">{routeEventText(event)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
            {formatMoment(event.createdAt)}
            {event.user ? ` · ${event.user.firstName} ${event.user.lastName}` : ''}
          </p>
        </li>
      ))}
    </ol>
  );
}
