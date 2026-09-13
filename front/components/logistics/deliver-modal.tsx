'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { logisticsApi, type DeliveryNote } from '../../lib/api/logistics';
import { DeliveryMap } from './delivery-map';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const DEFAULT_CENTER: [number, number] = [-25.2637, -57.5759]; // Asunción

// Confirmar/corregir ubicación al entregar — compartido entre la fila de
// "Mis entregas" (acción rápida) y su página de detalle.
export function DeliverModal({ note, onClose }: { note: DeliveryNote; onClose: () => void }) {
  const queryClient = useQueryClient();
  const customer = note.saleOrder.customer;
  const [locationConfirmed, setLocationConfirmed] = useState<boolean | null>(null);
  const [lat, setLat] = useState(customer.latitude ?? DEFAULT_CENTER[0]);
  const [lng, setLng] = useState(customer.longitude ?? DEFAULT_CENTER[1]);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      logisticsApi.recordTrackingEvent(note.id, {
        checkpoint: 'DELIVERED',
        latitude: lat,
        longitude: lng,
        locationConfirmed: locationConfirmed ?? true,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['logistics-mine'] });
      onClose();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al confirmar la entrega'));
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-2xl border border-border shadow-lg w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Confirmar entrega</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mb-3">
          {customer.latitude != null
            ? 'Confirmá si el pin marca el lugar donde entregaste, o arrastralo para corregirlo.'
            : 'No hay una ubicación registrada — marcá el pin en el lugar de entrega.'}
        </p>

        <DeliveryMap latitude={lat} longitude={lng} draggable onDragEnd={(newLat, newLng) => {
          setLat(newLat);
          setLng(newLng);
          setLocationConfirmed(false);
        }} height={220} />

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setLat(customer.latitude ?? DEFAULT_CENTER[0]);
              setLng(customer.longitude ?? DEFAULT_CENTER[1]);
              setLocationConfirmed(true);
            }}
            className={cn(
              'flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
              locationConfirmed === true
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:border-foreground/20',
            )}
          >
            ✓ La ubicación es correcta
          </button>
          <button
            type="button"
            onClick={() => setLocationConfirmed(false)}
            className={cn(
              'flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-colors',
              locationConfirmed === false
                ? 'border-warn bg-warn-subtle text-warn'
                : 'border-border text-muted-foreground hover:border-foreground/20',
            )}
          >
            Actualizar ubicación
          </button>
        </div>

        {error && <p className="text-destructive text-xs mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-emerald-600 hover:bg-emerald-700"
            onClick={() => { setError(''); mutation.mutate(); }}
            disabled={mutation.isPending || locationConfirmed === null}
          >
            {mutation.isPending ? 'Confirmando…' : 'Confirmar y entregar'}
          </Button>
        </div>
      </div>
    </div>
  );
}
