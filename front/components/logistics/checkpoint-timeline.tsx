import { CheckCircle2, MapPinCheck, PackageCheck, Truck, Warehouse } from 'lucide-react';
import { CHECKPOINT_LABELS, type DeliveryCheckpoint, type DeliveryTrackingEvent } from '../../lib/api/logistics';
import { cn } from '@/lib/utils';

const CHECKPOINT_ICON: Record<DeliveryCheckpoint, React.ElementType> = {
  LEFT_WAREHOUSE: Warehouse,
  IN_TRANSIT: Truck,
  ARRIVED: MapPinCheck,
  DELIVERED: PackageCheck,
};

function fmtDateTime(iso: string) {
  return new Intl.DateTimeFormat('es-PY', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));
}

export function CheckpointTimeline({ events }: { events: DeliveryTrackingEvent[] }) {
  const checkpoints = events.filter((e) => e.checkpoint);
  if (checkpoints.length === 0) return null;

  return (
    <div className="space-y-0">
      {checkpoints.map((event, idx) => {
        const Icon = event.checkpoint ? CHECKPOINT_ICON[event.checkpoint] : CheckCircle2;
        const isLast = idx === checkpoints.length - 1;
        return (
          <div key={event.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  event.checkpoint === 'DELIVERED'
                    ? 'bg-accent-subtle text-accent-on'
                    : 'bg-muted/30 text-muted-foreground',
                )}
              >
                <Icon size={14} />
              </div>
              {!isLast && <div className="w-px flex-1 bg-border" />}
            </div>
            <div className={cn('pb-4', isLast && 'pb-0')}>
              <p className="text-sm font-medium text-foreground">
                {event.checkpoint ? CHECKPOINT_LABELS[event.checkpoint] : '—'}
              </p>
              <p className="text-xs text-muted-foreground/60">
                {fmtDateTime(event.recordedAt)}
                {event.recordedBy ? ` · ${event.recordedBy.firstName} ${event.recordedBy.lastName}` : ''}
              </p>
              {event.locationConfirmed === false && (
                <p className="text-xs text-warn">Ubicación corregida por el repartidor</p>
              )}
              {event.notes && <p className="mt-0.5 text-xs text-muted-foreground">{event.notes}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
