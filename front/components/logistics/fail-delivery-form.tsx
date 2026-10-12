'use client';

import { useState } from 'react';
import type { FailDeliveryPayload, FailureReason } from '@/lib/api/delivery-routes';
import { FAILURE_REASON_LABELS } from '@/lib/delivery-route';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const REASONS = Object.keys(FAILURE_REASON_LABELS) as FailureReason[];

// Dónde estaba quien lo registra, si el navegador lo da enseguida. No frena
// el registro: sin permiso o sin señal se guarda igual, sin ubicación.
function currentPosition(): Promise<{ latitude: number; longitude: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(null),
      { timeout: 4000, maximumAge: 60_000 },
    );
  });
}

/** Deja asentado por qué no se pudo entregar una parada. */
export function FailDeliveryForm({
  customerName,
  busy,
  onSubmit,
  onCancel,
}: {
  customerName: string;
  busy: boolean;
  onSubmit: (dto: FailDeliveryPayload) => void;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState<FailureReason | ''>('');
  const [note, setNote] = useState('');
  const [locating, setLocating] = useState(false);
  const needsNote = reason === 'OTHER' && !note.trim();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!reason || needsNote) return;
    setLocating(true);
    const position = await currentPosition();
    setLocating(false);
    onSubmit({ reason, note: note.trim() || undefined, ...(position ?? {}) });
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl bg-muted/40 p-4">
      <p className="text-sm font-medium">No se pudo entregar a {customerName}</p>
      <p className="text-xs text-muted-foreground">
        El pedido vuelve a pendiente, sin ruta, para asignarlo de nuevo.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fail-reason">Motivo</Label>
          <Select value={reason || 'none'} onValueChange={(value) => setReason(value && value !== 'none' ? (value as FailureReason) : '')}>
            <SelectTrigger id="fail-reason" className="w-full">
              <span className="flex-1 truncate text-left text-sm">
                {reason ? FAILURE_REASON_LABELS[reason] : 'Elegí el motivo'}
              </span>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Elegí el motivo</SelectItem>
              {REASONS.map((value) => (
                <SelectItem key={value} value={value}>
                  {FAILURE_REASON_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fail-note">Detalle{reason === 'OTHER' ? '' : ' (opcional)'}</Label>
          <Textarea
            id="fail-note"
            value={note}
            maxLength={300}
            rows={2}
            placeholder="Qué pasó, cuándo conviene volver…"
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="destructive" size="sm" disabled={!reason || needsNote || busy || locating}>
          {busy || locating ? 'Guardando…' : 'Registrar entrega no realizada'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
