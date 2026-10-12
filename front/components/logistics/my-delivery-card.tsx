'use client';

import Link from 'next/link';
import { CheckCircle2, MapPin, Package, Phone, Truck } from 'lucide-react';
import type { FailDeliveryPayload } from '@/lib/api/delivery-routes';
import { CHECKPOINT_LABELS, type DeliveryCheckpoint, type DeliveryNote } from '@/lib/api/logistics';
import { stopNextCheckpoint, stopStage, type DeliveryCardData } from '@/lib/my-deliveries';
import { FailDeliveryForm } from './fail-delivery-form';
import { OpenInMaps } from './open-in-maps';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';

/**
 * Lo que el repartidor puede hacer con una parada. Recibe todos los pedidos de
 * la parada: si el cliente tiene varios en la ruta, la acción vale para todos.
 */
export interface DeliveryCardActions {
  deliver: (notes: DeliveryNote[]) => void;
  checkpoint: (notes: DeliveryNote[], checkpoint: DeliveryCheckpoint) => void;
  dispatch: (noteId: string) => void;
  fail: (notes: DeliveryNote[], dto: FailDeliveryPayload) => void;
}

/**
 * Una parada por hacer: a quién, dónde, qué lleva y lo que toca hacer ahora.
 * Sirve igual para un cliente con varios pedidos en la ruta que para una
 * entrega suelta.
 */
export function MyDeliveryCard({
  data,
  notes,
  position,
  inRoute,
  canFail,
  busy,
  failing,
  onFailing,
  actions,
}: {
  data: DeliveryCardData;
  /** Los pedidos de la parada que siguen por hacer. */
  notes: DeliveryNote[];
  /** Lugar en el recorrido de su ruta. */
  position?: number;
  inRoute: boolean;
  /** Se puede registrar que no se pudo entregar (ruta en curso). */
  canFail: boolean;
  busy: boolean;
  failing: boolean;
  onFailing: (failing: boolean) => void;
  actions: DeliveryCardActions;
}) {
  const title = (
    <>
      {position !== undefined && (
        <span className="mr-2 tabular-nums text-muted-foreground">{position}.</span>
      )}
      {data.customerName}
    </>
  );

  // Ya entregada: queda en la ruta como constancia, sin acciones.
  if (data.status === 'DELIVERED') {
    return (
      <li className="flex items-center justify-between gap-3 rounded-2xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <span className="min-w-0 truncate">{title}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <CheckCircle2 size={14} aria-hidden />
          Entregado
        </span>
      </li>
    );
  }

  const onTheWay = data.status === 'DISPATCHED';
  const next = onTheWay ? stopNextCheckpoint(notes) : null;
  const several = notes.length > 1;

  return (
    <li className="rounded-2xl bg-muted/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="min-w-0 text-base font-medium">{title}</h4>
        <span className="flex flex-wrap items-center gap-1.5">
          {several && <Badge variant="secondary">{notes.length} pedidos</Badge>}
          <Badge variant={onTheWay ? 'default' : 'outline'}>{stopStage(data.status, notes)}</Badge>
        </span>
      </div>

      <dl className="mt-2 space-y-1 text-sm">
        <div className="flex items-start gap-2 text-muted-foreground">
          <dt className="mt-0.5 shrink-0">
            <MapPin size={14} aria-hidden />
            <span className="sr-only">Dirección</span>
          </dt>
          <dd>
            {data.address ?? 'Sin dirección cargada'}
            {data.reference && <span className="block">Referencia: {data.reference}</span>}
          </dd>
        </div>
        {data.items.length > 0 && (
          <div className="flex items-start gap-2">
            <dt className="mt-0.5 shrink-0 text-muted-foreground">
              <Package size={14} aria-hidden />
              <span className="sr-only">Productos</span>
            </dt>
            <dd>{data.items.map((item) => `${item.quantity} × ${item.name}`).join(' · ')}</dd>
          </div>
        )}
      </dl>

      {/* Lo que toca hacer ahora, primero y bien visible. */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {onTheWay && notes.length > 0 && (
          <Button disabled={busy} onClick={() => actions.deliver(notes)}>
            <CheckCircle2 aria-hidden />
            Confirmar y entregar{several ? ' todo' : ''}
          </Button>
        )}
        {next && (
          <Button variant="outline" disabled={busy} onClick={() => actions.checkpoint(notes, next)}>
            Marcar: {CHECKPOINT_LABELS[next].toLowerCase()}
          </Button>
        )}
        {data.status === 'PENDING' && !inRoute && notes.length > 0 && (
          <Button disabled={busy} onClick={() => actions.dispatch(notes[0].id)}>
            <Truck aria-hidden />
            Despachar
          </Button>
        )}
        {data.status === 'PENDING' && inRoute && (
          <p className="text-sm text-muted-foreground">Sale cuando inicies la ruta.</p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <OpenInMaps destination={data} />
        {data.phone && (
          <a
            href={`tel:${data.phone.replace(/\s+/g, '')}`}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <Phone aria-hidden />
            {data.phone}
          </a>
        )}
        {several ? (
          notes.map((note, index) => (
            <Link
              key={note.id}
              href={`/dashboard/logistics/mine/${note.id}`}
              className={buttonVariants({ variant: 'ghost', size: 'sm' })}
            >
              Ver pedido {index + 1}
            </Link>
          ))
        ) : (
          <Link
            href={`/dashboard/logistics/mine/${notes[0]?.id ?? data.id}`}
            className={buttonVariants({ variant: 'ghost', size: 'sm' })}
          >
            Ver detalle
          </Link>
        )}
        {canFail && onTheWay && !failing && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={busy}
            onClick={() => onFailing(true)}
          >
            No se pudo entregar
          </Button>
        )}
      </div>

      {failing && (
        <div className="mt-3">
          <FailDeliveryForm
            customerName={data.customerName}
            busy={busy}
            onCancel={() => onFailing(false)}
            onSubmit={(dto) => actions.fail(notes, dto)}
          />
        </div>
      )}
    </li>
  );
}
