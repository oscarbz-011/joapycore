'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Package, Truck, CheckCircle2, Clock, ChevronDown, ChevronRight, MapPin, Phone, UserCog, X } from 'lucide-react';
import {
  logisticsApi,
  ASSIGNMENT_MODE_LABELS,
  type AssignDeliveryPayload,
  type CourierOption,
  type DeliveryAssignmentMode,
  type DeliveryNote,
  type DeliveryNoteStatus,
  STATUS_LABELS,
} from '../../../../../lib/api/logistics';
import type { Customer as DeliveryCustomer } from '../../../../../lib/api/sales';
import { formatDatePY } from '../../../../../lib/date';
import { DeliveryMap } from '../../../../../components/logistics/delivery-map';
import { CheckpointTimeline } from '../../../../../components/logistics/checkpoint-timeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Constants ──────────────────────────────────────────────────────────────────

const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

// ── Helpers ────────────────────────────────────────────────────────────────────


function formatPrice(v: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency', currency: 'PYG', maximumFractionDigits: 0,
  }).format(v);
}

// `saleOrder.deliveryAddress` no existe en el schema (nunca existió — era un
// tipo del frontend sin backing real, siempre undefined en runtime). La
// dirección real vive en los campos estructurados del cliente.
function formatDeliveryAddress(customer: DeliveryCustomer): string | null {
  const houseParts = [customer.homeStreet, customer.homeNeighborhood].filter(Boolean);
  const aptParts = [customer.aptBuilding, customer.aptFloor, customer.aptNumber].filter(Boolean);
  const structured = [...houseParts, ...aptParts].join(', ');
  if (structured) return structured;
  if (customer.address) return [customer.address, customer.city].filter(Boolean).join(', ');
  return null;
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
  // El repartidor/empresa ya se definió al asignar (AssignModal) — este modal
  // NO vuelve a pedirlo, solo agrega datos que la asignación no captura
  // (vehículo/patente) y confirma el despacho. Si hace falta cambiar a
  // quién está asignado, es "Reasignar", no esto.
  const [form, setForm] = useState<{ vehicle: string; notes: string }>({
    vehicle: note.vehicle ?? '',
    notes: note.notes ?? '',
  });

  const assignedTo = note.assignmentMode === 'EXTERNAL_COMPANY'
    ? note.carrier
    : note.assignedEmployee
      ? `${note.assignedEmployee.firstName} ${note.assignedEmployee.lastName}`
      : note.carrier;

  const mutation = useMutation({
    mutationFn: () => logisticsApi.dispatch(note.id, {
      vehicle: form.vehicle.trim() || undefined,
      notes: form.notes.trim() || undefined,
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
          <div className="rounded-xl bg-muted/20 px-3 py-2.5 text-sm">
            <p className="text-xs text-muted-foreground/60">
              {note.assignmentMode ? ASSIGNMENT_MODE_LABELS[note.assignmentMode] : 'Asignado a'}
            </p>
            <p className="font-medium text-foreground">{assignedTo || '—'}</p>
          </div>
          <div className="space-y-1.5">
            <Label>Vehículo / Patente</Label>
            <Input
              value={form.vehicle}
              onChange={(e) => setForm((p) => ({ ...p, vehicle: e.target.value }))}
              placeholder="Ej: ABC 123"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Observaciones</Label>
            <textarea
              rows={2}
              className={TEXTAREA_CLS}
              value={form.notes}
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

// ── AssignModal ────────────────────────────────────────────────────────────────

const ASSIGNMENT_MODES: DeliveryAssignmentMode[] = ['INTERNAL_EMPLOYEE', 'EXTERNAL_COURIER_USER', 'EXTERNAL_COMPANY'];

function AssignModal({ note, onClose }: { note: DeliveryNote; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<DeliveryAssignmentMode>(note.assignmentMode ?? 'INTERNAL_EMPLOYEE');
  const [employeeId, setEmployeeId] = useState(note.assignedEmployee?.id ?? '');
  const [carrier, setCarrier] = useState(note.assignmentMode === 'EXTERNAL_COMPANY' ? (note.carrier ?? '') : '');
  const [externalTrackingRef, setExternalTrackingRef] = useState(note.externalTrackingRef ?? '');
  const [error, setError] = useState('');

  const { data: couriers = [] } = useQuery({
    queryKey: ['logistics-couriers'],
    queryFn: logisticsApi.listCouriers,
    enabled: mode !== 'EXTERNAL_COMPANY',
  });

  const mutation = useMutation({
    mutationFn: () => {
      const dto: AssignDeliveryPayload = {
        assignmentMode: mode,
        assignedEmployeeId: mode !== 'EXTERNAL_COMPANY' ? employeeId || undefined : undefined,
        carrier: mode === 'EXTERNAL_COMPANY' ? carrier || undefined : undefined,
        externalTrackingRef: externalTrackingRef || undefined,
      };
      return logisticsApi.assign(note.id, dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['logistics-deliveries'] });
      onClose();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al asignar la entrega'));
    },
  });

  const canSubmit =
    mode === 'EXTERNAL_COMPANY' ? carrier.trim().length > 0 : employeeId.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-card rounded-2xl border border-border shadow-lg w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">Asignar entrega</h2>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <X size={16} />
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Modalidad</Label>
            <div className="space-y-1.5">
              {ASSIGNMENT_MODES.map((m) => (
                <label
                  key={m}
                  className={cn(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors',
                    mode === m ? 'border-primary bg-primary/5' : 'border-border hover:border-foreground/20',
                  )}
                >
                  <input
                    type="radio"
                    className="accent-primary"
                    checked={mode === m}
                    onChange={() => setMode(m)}
                  />
                  {ASSIGNMENT_MODE_LABELS[m]}
                </label>
              ))}
            </div>
          </div>

          {mode !== 'EXTERNAL_COMPANY' ? (
            <div className="space-y-1.5">
              <Label>Empleado *</Label>
              <Select value={employeeId || 'none'} onValueChange={(v) => setEmployeeId(v && v !== 'none' ? v : '')}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">
                    {(() => {
                      const c = (couriers as CourierOption[]).find((x) => x.id === employeeId);
                      return c ? `${c.firstName} ${c.lastName}` : '— Seleccionar —';
                    })()}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Seleccionar —</SelectItem>
                  {(couriers as CourierOption[]).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.firstName} {c.lastName}{c.contractType === 'CONTRACTOR' ? ' (externo)' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {mode === 'EXTERNAL_COURIER_USER' && (
                <p className="text-[11px] text-muted-foreground/70">
                  Debe ser un empleado con usuario propio en el sistema (contrato &quot;Contractor&quot;) para poder ver y actualizar su entrega.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Empresa de courier *</Label>
                <Input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Ej: Correo Rápido SA" />
              </div>
              <div className="space-y-1.5">
                <Label>N° de guía (opcional)</Label>
                <Input value={externalTrackingRef} onChange={(e) => setExternalTrackingRef(e.target.value)} />
              </div>
              <p className="text-[11px] text-muted-foreground/70">
                Sin tracking en el sistema — el staff marca &quot;entregado&quot; manualmente cuando el courier confirme por fuera.
              </p>
            </>
          )}
        </div>

        {error && <p className="text-destructive text-xs mt-3">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => { setError(''); mutation.mutate(); }} disabled={mutation.isPending || !canSubmit}>
            {mutation.isPending ? 'Asignando…' : 'Confirmar asignación'}
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
  const [assigning, setAssigning] = useState(false);
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
  const address = formatDeliveryAddress(customer);
  const hasCoords = customer.latitude != null && customer.longitude != null;

  return (
    <>
      {dispatching && <DispatchModal note={note} onClose={() => setDispatching(false)} />}
      {assigning && <AssignModal note={note} onClose={() => setAssigning(false)} />}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', STATUS_BADGE[note.status])}>
            <Icon size={12} />
            {STATUS_LABELS[note.status]}
          </span>

          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{fullName}</p>
            <p className="text-xs text-muted-foreground/60">
              #{note.saleOrder.id.slice(0, 8).toUpperCase()} · {formatDatePY(note.issuedAt, 'local')}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {note.status === 'PENDING' && !note.assignmentMode && (
              <Button size="sm" variant="outline" onClick={() => setAssigning(true)}>
                <UserCog size={13} />
                Asignar
              </Button>
            )}
            {note.status === 'PENDING' && note.assignmentMode && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setAssigning(true)}>
                  Reasignar
                </Button>
                <Button size="sm" onClick={() => setDispatching(true)}>
                  Despachar
                </Button>
              </>
            )}
            {note.status === 'DISPATCHED' && note.assignmentMode === 'EXTERNAL_COMPANY' && (
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
            {(address || customer.phone) && (
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                {address && (
                  <span className="flex items-center gap-1">
                    <MapPin size={11} />
                    {address}
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

            {note.assignmentMode && (
              <div className="text-xs text-muted-foreground flex flex-wrap gap-4">
                <span>
                  <span className="font-medium">{ASSIGNMENT_MODE_LABELS[note.assignmentMode]}:</span>{' '}
                  {note.assignmentMode === 'EXTERNAL_COMPANY' ? note.carrier : note.assignedEmployee ? `${note.assignedEmployee.firstName} ${note.assignedEmployee.lastName}` : note.carrier}
                </span>
                {note.vehicle && <span><span className="font-medium">Vehículo:</span> {note.vehicle}</span>}
                {note.externalTrackingRef && <span><span className="font-medium">Guía:</span> {note.externalTrackingRef}</span>}
              </div>
            )}

            {note.assignmentMode === 'EXTERNAL_COMPANY' ? (
              <p className="text-xs text-muted-foreground/60 italic">
                Sin seguimiento: es un courier externo — no hay checkpoints ni ubicación en el sistema, se marca &quot;Entregado&quot; manualmente cuando el courier confirme por fuera.
              </p>
            ) : (
              <>
                {note.trackingEvents.length > 0 ? (
                  <div className="rounded-xl bg-muted/10 p-3">
                    <CheckpointTimeline events={note.trackingEvents} />
                  </div>
                ) : note.assignmentMode && (
                  <p className="text-xs text-muted-foreground/60 italic">
                    Sin checkpoints todavía — el repartidor los carga desde &quot;Mis entregas&quot; una vez despachada.
                  </p>
                )}

                {hasCoords ? (
                  <DeliveryMap latitude={customer.latitude!} longitude={customer.longitude!} height={160} />
                ) : (
                  <p className="text-xs text-muted-foreground/60 italic">
                    Sin ubicación del cliente registrada — se completa cuando el repartidor confirma o corrige la ubicación al entregar.
                  </p>
                )}
              </>
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
                {note.saleOrder.items.map((item) => {
                  // Ventas a crédito: el precio contado no es el que paga el
                  // cliente — usar financedUnitPrice (ya incluye el interés)
                  // cuando esté presente.
                  const price = note.saleOrder.saleType === 'CREDIT' && item.financedUnitPrice != null
                    ? item.financedUnitPrice
                    : item.unitPrice;
                  return (
                    <tr key={item.id} className="border-b border-border/50">
                      <td className="py-1.5 text-foreground">{item.product.name}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{item.quantity}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{formatPrice(price)}</td>
                      <td className="py-1.5 text-right text-foreground font-medium">
                        {formatPrice(item.quantity * price)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {note.notes && (
              <p className="text-xs text-muted-foreground/60 italic">{note.notes}</p>
            )}

            {note.deliveredAt && (
              <p className="text-xs text-emerald-600 font-medium">
                Entregado el {formatDatePY(note.deliveredAt, 'local')}
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
