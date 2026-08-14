'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Truck, CheckCircle2, Clock, ChevronDown, ChevronRight, MapPin, Phone, X } from 'lucide-react';
import {
  logisticsApi,
  DeliveryNote,
  DeliveryNoteStatus,
  DispatchDeliveryPayload,
  STATUS_LABELS,
} from '../../../../../lib/api/logistics';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────

const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });
}

function formatPrice(v: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency', currency: 'PYG', maximumFractionDigits: 0,
  }).format(v);
}

const STATUS_ICON: Record<DeliveryNoteStatus, React.ElementType> = {
  PENDING:    Clock,
  DISPATCHED: Truck,
  DELIVERED:  CheckCircle2,
  CANCELLED:  Package,
};

const STATUS_BADGE: Record<DeliveryNoteStatus, string> = {
  PENDING:    'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  DISPATCHED: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  DELIVERED:  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  CANCELLED:  'bg-muted/30 text-muted-foreground',
};

// ── DispatchModal ──────────────────────────────────────────────────────────────

function DispatchModal({ note, onClose }: { note: DeliveryNote; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<DispatchDeliveryPayload>({ carrier: '', vehicle: '', notes: '' });

  const mutation = useMutation({
    mutationFn: () => logisticsApi.dispatch(note.id, {
      carrier: form.carrier || undefined,
      vehicle: form.vehicle || undefined,
      notes: form.notes || undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logistics-deliveries'] });
      onClose();
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-2xl border border-border shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Despachar entrega</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Repartidor / Transportista</Label>
            <Input
              value={form.carrier ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, carrier: e.target.value }))}
              placeholder="Nombre del repartidor"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Vehículo / Patente</Label>
            <Input
              value={form.vehicle ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, vehicle: e.target.value }))}
              placeholder="Ej: ABC 123"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <textarea
              rows={2}
              className={TEXTAREA_CLS}
              value={form.notes ?? ''}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
            />
          </div>
        </div>

        {mutation.isError && (
          <p className="text-destructive text-xs mt-3">
            {(mutation.error as Error)?.message ?? 'Error al despachar'}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? 'Despachando…' : 'Confirmar despacho'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── DeliveryCard ───────────────────────────────────────────────────────────────

function DeliveryCard({ note }: { note: DeliveryNote }) {
  const [expanded, setExpanded] = useState(false);
  const [dispatching, setDispatching] = useState(false);
  const queryClient = useQueryClient();

  const Icon = STATUS_ICON[note.status];

  const deliverMutation = useMutation({
    mutationFn: () => logisticsApi.markDelivered(note.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['logistics-deliveries'] });
    },
  });

  const customer = note.saleOrder.customer;
  const fullName = `${customer.firstName} ${customer.lastName}`;

  return (
    <>
      {dispatching && <DispatchModal note={note} onClose={() => setDispatching(false)} />}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', STATUS_BADGE[note.status])}>
            <Icon size={12} />
            {STATUS_LABELS[note.status]}
          </span>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{fullName}</p>
            <p className="text-xs text-muted-foreground/60">{note.saleOrder.code} · {formatDate(note.issuedAt)}</p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {note.status === 'PENDING' && (
              <Button size="sm" onClick={() => setDispatching(true)}>
                Despachar
              </Button>
            )}
            {note.status === 'DISPATCHED' && (
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => deliverMutation.mutate()}
                disabled={deliverMutation.isPending}
              >
                {deliverMutation.isPending ? 'Confirmando…' : 'Marcar entregado'}
              </Button>
            )}
            <button
              onClick={() => setExpanded((v) => !v)}
              className="p-1.5 rounded-lg hover:bg-muted/20 text-muted-foreground/60 transition-colors"
            >
              {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
          </div>
        </div>

        {expanded && (
          <div className="border-t border-border px-4 py-3 space-y-3">
            {(note.saleOrder.deliveryAddress || customer.phone) && (
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                {note.saleOrder.deliveryAddress && (
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />
                    {note.saleOrder.deliveryAddress}
                  </span>
                )}
                {customer.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={11} />
                    {customer.phone}
                  </span>
                )}
              </div>
            )}

            {note.carrier && (
              <div className="text-xs text-muted-foreground flex gap-4">
                <span><span className="font-medium">Repartidor:</span> {note.carrier}</span>
                {note.vehicle && <span><span className="font-medium">Vehículo:</span> {note.vehicle}</span>}
              </div>
            )}

            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground/60 border-b border-border">
                  <th className="text-left py-1 font-medium">Producto</th>
                  <th className="text-right py-1 font-medium">Cant.</th>
                  <th className="text-right py-1 font-medium">Precio unit.</th>
                  <th className="text-right py-1 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {note.saleOrder.items.map((item) => (
                  <tr key={item.id} className="border-b border-border/50">
                    <td className="py-1.5 text-foreground">{item.product.name}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{item.quantity}</td>
                    <td className="py-1.5 text-right text-muted-foreground">{formatPrice(item.unitPrice)}</td>
                    <td className="py-1.5 text-right text-foreground font-medium">
                      {formatPrice(item.quantity * item.unitPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {note.notes && (
              <p className="text-xs text-muted-foreground/60 italic">{note.notes}</p>
            )}

            {note.deliveredAt && (
              <p className="text-xs text-emerald-600 font-medium">
                Entregado el {formatDate(note.deliveredAt)}
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const FILTER_OPTIONS: { value: DeliveryNoteStatus | ''; label: string }[] = [
  { value: '', label: 'Todos' },
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'DISPATCHED', label: 'En camino' },
  { value: 'DELIVERED', label: 'Entregados' },
  { value: 'CANCELLED', label: 'Cancelados' },
];

const SUMMARY_CHIPS = [
  { key: 'PENDING'    as const, label: 'Pendientes', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300' },
  { key: 'DISPATCHED' as const, label: 'En camino',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300'   },
  { key: 'DELIVERED'  as const, label: 'Entregados', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' },
];

export default function DeliveriesPage() {
  const [statusFilter, setStatusFilter] = useState<DeliveryNoteStatus | ''>('');

  const { data: notes = [], isLoading, isError } = useQuery({
    queryKey: ['logistics-deliveries', statusFilter],
    queryFn: () => logisticsApi.listDeliveries(statusFilter || undefined),
  });

  const counts: Record<string, number> = {
    PENDING:    notes.filter((n) => n.status === 'PENDING').length,
    DISPATCHED: notes.filter((n) => n.status === 'DISPATCHED').length,
    DELIVERED:  notes.filter((n) => n.status === 'DELIVERED').length,
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Entregas</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Gestión de notas de entrega y seguimiento de despachos</p>
      </div>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-3">
        {SUMMARY_CHIPS.map((s) => (
          <div key={s.key} className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold', s.cls)}>
            <span className="text-base font-bold">{counts[s.key]}</span>
            {s.label}
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 border-b border-border">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={cn(
              'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              statusFilter === opt.value
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-muted-foreground/60 text-sm">
          Cargando entregas…
        </div>
      )}

      {isError && (
        <div className="flex items-center justify-center py-16 text-destructive text-sm">
          Error al cargar las entregas.
        </div>
      )}

      {!isLoading && !isError && notes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/60 gap-2">
          <Truck size={36} className="opacity-30" />
          <p className="text-sm">No hay entregas{statusFilter ? ` en estado "${STATUS_LABELS[statusFilter as DeliveryNoteStatus]}"` : ''}</p>
        </div>
      )}

      {!isLoading && !isError && notes.length > 0 && (
        <div className="space-y-3">
          {notes.map((note) => (
            <DeliveryCard key={note.id} note={note} />
          ))}
        </div>
      )}
    </div>
  );
}
