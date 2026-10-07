'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiErrorMessage } from '@/lib/api/api-error';
import { logisticsApi, type DeliveryNote } from '@/lib/api/logistics';
import { useAuth } from '@/lib/auth-context';
import { formatDatePY } from '@/lib/date';
import {
  DELIVERY_METHOD_LABEL,
  deliveryMethodActions,
  deliveryMethodSummary,
  pickupConfirmation,
  rejectionError,
  type DeliveryMethod,
} from '@/lib/delivery-method';
import { cn } from '@/lib/utils';

const METHOD_CLASS: Record<DeliveryMethod, string> = {
  HOME_DELIVERY: '',
  PICKUP: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800',
  SELLER: 'bg-warn-subtle text-warn border-warn/30',
};

export function DeliveryMethodBadge({ method }: { method: DeliveryMethod }) {
  return (
    <Badge variant="outline" className={cn('whitespace-nowrap', METHOD_CLASS[method])}>
      {DELIVERY_METHOD_LABEL[method]}
    </Badge>
  );
}

type Form = 'pickup' | 'request' | 'authorize' | 'reject' | null;

const person = (p: { firstName: string; lastName: string } | null) =>
  p ? `${p.firstName} ${p.lastName}` : 'alguien';

/**
 * Cómo se entrega un pedido y lo que cada uno puede hacer al respecto: elegir
 * retiro o envío, registrar el retiro, pedir llevarlo (vendedor), autorizarlo
 * (supervisor) y marcarlo entregado. Lo usan Logística y la venta.
 */
export function DeliveryMethodPanel({
  note,
  className,
}: {
  note: DeliveryNote;
  className?: string;
}) {
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const actions = deliveryMethodActions(note, {
    userId: jwtPayload?.sub ?? '',
    permissions: jwtPayload?.permissions ?? [],
  });

  const [form, setForm] = useState<Form>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  function open(next: Form) {
    setError('');
    setText('');
    setForm(next);
  }

  const mutation = useMutation({
    mutationFn: (run: () => Promise<DeliveryNote>) => run(),
    onSuccess: () => {
      setForm(null);
      void queryClient.invalidateQueries({ queryKey: ['logistics-deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['order-delivery', note.saleOrder.id] });
      // Cerrar la entrega mueve el pedido y descuenta stock.
      void queryClient.invalidateQueries({ queryKey: ['sale-orders'] });
    },
    onError: (err) => {
      setError(apiErrorMessage(err, 'No se pudo guardar'));
      // Otra persona pudo haberla cambiado: lo que se ve ya no vale.
      void queryClient.invalidateQueries({ queryKey: ['logistics-deliveries'] });
      void queryClient.invalidateQueries({ queryKey: ['order-delivery', note.saleOrder.id] });
    },
  });
  const run = (action: () => Promise<DeliveryNote>) => {
    setError('');
    mutation.mutate(action);
  };

  function submit() {
    if (form === 'pickup') {
      return run(() => logisticsApi.registerPickup(note.id));
    }
    if (form === 'request') {
      return run(() => logisticsApi.requestSellerDelivery(note.id, text.trim() || undefined));
    }
    if (form === 'authorize') {
      return run(() => logisticsApi.authorizeSellerDelivery(note.id, text.trim() || undefined));
    }
    if (form === 'reject') {
      const problem = rejectionError(text);
      if (problem) return setError(problem);
      return run(() => logisticsApi.rejectSellerDelivery(note.id, text.trim()));
    }
  }

  const FORM_COPY: Record<Exclude<Form, null>, { title: string; submit: string }> = {
    pickup: {
      title: pickupConfirmation(note.saleOrder.customer),
      submit: 'Sí, lo retiró el cliente',
    },
    request: {
      title: 'Pedir llevar este pedido en persona. Lo tiene que autorizar un supervisor.',
      submit: 'Pedir autorización',
    },
    authorize: {
      title: `Autorizar que ${person(note.sellerRequestedBy)} lleve este pedido. La entrega queda a su nombre.`,
      submit: 'Autorizar',
    },
    reject: {
      title: 'No autorizar. El pedido vuelve a envío a domicilio, sin asignar.',
      submit: 'No autorizar',
    },
  };

  const hasActions = Object.values(actions).some(Boolean);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <DeliveryMethodBadge method={note.method} />
        <p className="text-sm text-foreground">{deliveryMethodSummary(note)}</p>
      </div>

      {note.method === 'PICKUP' && note.pickedUpByDocument && (
        <p className="text-xs text-muted-foreground">Documento: {note.pickedUpByDocument}</p>
      )}

      {note.sellerRequestStatus && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <p>
            Lo pidió {person(note.sellerRequestedBy)}
            {note.sellerRequestedAt && ` el ${formatDatePY(note.sellerRequestedAt, 'local')}`}
            {note.sellerRequestNote && `: «${note.sellerRequestNote}»`}
          </p>
          {note.sellerRequestStatus !== 'PENDING' && (
            <p>
              {note.sellerRequestStatus === 'AUTHORIZED' ? 'Lo autorizó' : 'No lo autorizó'}{' '}
              {person(note.sellerDecidedBy)}
              {note.sellerDecidedAt && ` el ${formatDatePY(note.sellerDecidedAt, 'local')}`}
              {note.sellerDecisionNote && `: «${note.sellerDecisionNote}»`}
            </p>
          )}
        </div>
      )}

      {form === null ? (
        hasActions && (
          <div className="flex flex-wrap gap-2">
            {actions.registerPickup && (
              <Button size="sm" onClick={() => open('pickup')}>
                Registrar retiro
              </Button>
            )}
            {actions.sellerDelivered && (
              <Button
                size="sm"
                disabled={mutation.isPending}
                onClick={() => run(() => logisticsApi.sellerDelivered(note.id))}
              >
                {mutation.isPending ? 'Guardando...' : 'Marcar entregado'}
              </Button>
            )}
            {actions.decideSeller && (
              <>
                <Button size="sm" onClick={() => open('authorize')}>
                  Autorizar al vendedor
                </Button>
                <Button size="sm" variant="outline" onClick={() => open('reject')}>
                  No autorizar
                </Button>
              </>
            )}
            {actions.setPickup && (
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => run(() => logisticsApi.setDeliveryMethod(note.id, 'PICKUP'))}
              >
                Retira el cliente en sucursal
              </Button>
            )}
            {actions.setHomeDelivery && (
              <Button
                size="sm"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => run(() => logisticsApi.setDeliveryMethod(note.id, 'HOME_DELIVERY'))}
              >
                Pasar a envío a domicilio
              </Button>
            )}
            {actions.requestSeller && (
              <Button size="sm" variant="outline" onClick={() => open('request')}>
                Lo llevo yo
              </Button>
            )}
          </div>
        )
      ) : (
        <form
          className="space-y-3 rounded-xl border border-border bg-muted/20 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className="text-xs text-muted-foreground">{FORM_COPY[form].title}</p>
          {form === 'pickup' ? null : (
            <Textarea
              rows={2}
              autoFocus
              maxLength={300}
              aria-label={
                form === 'request'
                  ? 'Por qué lo llevás vos'
                  : form === 'reject'
                    ? 'Por qué no se autoriza'
                    : 'Comentario'
              }
              placeholder={
                form === 'request'
                  ? 'Por qué lo llevás vos (opcional), ej. es vecino'
                  : form === 'reject'
                    ? 'Por qué no se autoriza'
                    : 'Comentario (opcional)'
              }
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
          <div className="flex gap-2">
            <Button
              type="submit"
              size="sm"
              variant={form === 'reject' ? 'destructive' : 'default'}
              disabled={mutation.isPending}
            >
              {mutation.isPending ? 'Guardando...' : FORM_COPY[form].submit}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => setForm(null)}
            >
              Volver
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
