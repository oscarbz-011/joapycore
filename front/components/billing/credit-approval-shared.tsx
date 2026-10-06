'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert, X } from 'lucide-react';
import {
  salesApi,
  type SaleOrder,
  type SaleOrderItem,
  type CreditAdjustmentSuggestion,
  type IncomeCapacity,
} from '../../lib/api/sales';
import { creditBureauApi } from '../../lib/api/credit-bureau';
import { formatDatePY } from '../../lib/date';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

// ── Helpers compartidos entre la lista y el detalle de aprobaciones ────────────

export function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('es-PY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDateShort(iso: string) {
  return formatDatePY(iso, 'utc');
}

// Para instantes reales (loan.startDate = loan.createdAt) — a diferencia de
// formatDateShort(), que ancla en UTC para preservar el día calendario de
// las fechas de vencimiento de cuotas (elegidas/calculadas como día, no
// instante). Sin esto, un crédito otorgado de noche en Paraguay mostraba
// "Compra" del día siguiente.
export function formatDateShortLocal(iso: string) {
  return formatDatePY(iso, 'local');
}

// En estas vistas todos los pedidos son a crédito — el precio contado
// (unitPrice) no es lo que va a pagar el cliente, financedUnitPrice ya
// incluye el interés y es lo único que tiene sentido mostrar por línea.
// OJO: no usar para el total del pedido (orderBase/orderTotal) — ahí
// unitPrice es la base pre-interés correcta, aplicar el interés de nuevo
// sobre financedUnitPrice lo duplicaría.
export function itemPrice(item: SaleOrderItem) {
  return item.financedUnitPrice ?? item.unitPrice;
}

export function orderBase(order: SaleOrder) {
  return order.items.reduce((s, i) => s + Number(i.unitPrice) * i.quantity, 0);
}

export function orderTotal(order: SaleOrder) {
  if (order.saleType === 'CREDIT') {
    if (order.loan?.totalAmount) return Number(order.loan.totalAmount);
    if (order.interestRate) return orderBase(order) * (1 + Number(order.interestRate) / 100);
  }
  return orderBase(order);
}

export const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

export const ADJUSTMENT_OPTIONS: { value: CreditAdjustmentSuggestion; label: string }[] = [
  { value: 'LOWER_VALUE_PRODUCT', label: 'Ofrecer un producto de menor valor' },
  { value: 'MORE_INSTALLMENTS', label: 'Aumentar la cantidad de cuotas' },
  { value: 'ADD_GUARANTOR', label: 'Agregar uno o más garantes' },
];

export const ADJUSTMENT_LABELS: Record<CreditAdjustmentSuggestion, string> = {
  LOWER_VALUE_PRODUCT: 'Producto de menor valor',
  MORE_INSTALLMENTS: 'Más cuotas',
  ADD_GUARANTOR: 'Agregar garante',
};

// ── Reject modal ───────────────────────────────────────────────────────────────

export function RejectModal({ order, open, onOpenChange, onSuccess }: {
  order: SaleOrder;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');

  const mutation = useMutation({
    mutationFn: () => salesApi.rejectCredit(order.id, reason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      setReason('');
      onOpenChange(false);
      onSuccess?.();
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md p-0">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <DialogTitle>Rechazar crédito</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Pedido de {order.customer.firstName} {order.customer.lastName}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Motivo del rechazo <span className="text-destructive">*</span></Label>
            <textarea
              rows={3}
              className={TEXTAREA_CLS}
              placeholder="Ej: Capacidad de pago insuficiente, historial de deuda..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {apiErrorMessage(mutation.error, 'Error al rechazar')}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => mutation.mutate()}
              disabled={reason.trim().length < 5 || mutation.isPending}
            >
              {mutation.isPending ? 'Rechazando...' : 'Confirmar rechazo'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Adjustment modal ───────────────────────────────────────────────────────────

export function AdjustmentModal({ order, open, onOpenChange, onSuccess }: {
  order: SaleOrder;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess?: () => void;
}) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<CreditAdjustmentSuggestion[]>([]);
  const [note, setNote] = useState('');

  const mutation = useMutation({
    mutationFn: () => salesApi.requestAdjustment(order.id, { suggestedAlternatives: selected, note: note.trim() || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pending-approvals'] });
      setSelected([]);
      setNote('');
      onOpenChange(false);
      onSuccess?.();
    },
  });

  function toggle(value: CreditAdjustmentSuggestion) {
    setSelected((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-md p-0">
        <div className="flex items-start justify-between border-b border-border px-6 py-4">
          <div>
            <DialogTitle>Necesita ajustes</DialogTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Enviar de vuelta al vendedor con alternativas — pedido de {order.customer.firstName} {order.customer.lastName}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <Label>Alternativas sugeridas <span className="text-destructive">*</span></Label>
            <div className="space-y-2 mt-1">
              {ADJUSTMENT_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt.value)}
                    onChange={() => toggle(opt.value)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Nota para el vendedor</Label>
            <textarea
              rows={3}
              className={TEXTAREA_CLS}
              placeholder="Ej: El cliente ya está cerca del tope de cuota por sueldo, sugerir alguna de las alternativas."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {mutation.isError && (
            <p className="text-xs text-destructive">
              {apiErrorMessage(mutation.error, 'Error al enviar')}
            </p>
          )}

          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => mutation.mutate()}
              disabled={selected.length === 0 || mutation.isPending}
            >
              {mutation.isPending ? 'Enviando...' : 'Enviar al vendedor'}
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Bureau check form (inline, replaces "Aprobar" until registered) ────────────

export function BureauCheckForm({ order }: { order: SaleOrder }) {
  const queryClient = useQueryClient();
  const [result, setResult] = useState<'CLEAN' | 'FLAGGED' | null>(null);
  const [notes, setNotes] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      creditBureauApi.recordCheck({
        customerId: order.customer.id,
        saleOrderId: order.id,
        result: result!,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['credit-evaluation', order.id] });
    },
  });

  return (
    <div className="rounded-xl border border-amber-300/40 bg-amber-50/60 p-3 dark:bg-amber-950/20 dark:border-amber-800/40">
      <p className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 mb-2">
        <ShieldAlert size={13} />
        Falta verificar al cliente en el buró de crédito
      </p>
      <div className="flex gap-2 mb-2">
        <button
          type="button"
          onClick={() => setResult('CLEAN')}
          className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            result === 'CLEAN' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'border-border text-muted-foreground hover:border-ring/50'
          }`}
        >
          Limpio
        </button>
        <button
          type="button"
          onClick={() => setResult('FLAGGED')}
          className={`flex-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            result === 'FLAGGED' ? 'border-destructive bg-destructive/15 text-destructive' : 'border-border text-muted-foreground hover:border-ring/50'
          }`}
        >
          Reportado
        </button>
      </div>
      <textarea
        rows={2}
        className={TEXTAREA_CLS + ' mb-2 text-xs'}
        placeholder="Notas de la consulta (opcional)"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {mutation.isError && (
        <p className="text-xs text-destructive mb-2">Error al registrar la verificación</p>
      )}
      <Button
        size="sm"
        className="w-full"
        disabled={!result || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        {mutation.isPending ? 'Registrando...' : 'Registrar verificación'}
      </Button>
    </div>
  );
}

// ── Capacidad de pago por sueldo ────────────────────────────────────────────────

export function IncomeCapacityBlock({ capacity }: { capacity: IncomeCapacity }) {
  if (!capacity.applicable) return null;
  const row = 'flex justify-between gap-3';
  return (
    <div className={`rounded-xl p-3 text-xs ${capacity.exceeds ? 'bg-destructive/10' : 'bg-muted/30'}`}>
      <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Capacidad de pago
      </p>
      <div className={row}>
        <span className="text-muted-foreground">
          Ingreso declarado{capacity.guarantorIncome > 0 ? ' (cliente + garante)' : ''}
        </span>
        <span className="tabular-nums text-foreground">{formatPrice(capacity.monthlyIncome!)}</span>
      </div>
      {capacity.guarantorIncome > 0 && (
        <p className="text-muted-foreground/70">
          · Cliente {formatPrice(capacity.customerIncome ?? 0)} + Garante {formatPrice(capacity.guarantorIncome)}
        </p>
      )}
      <div className={row}>
        <span className="text-muted-foreground">Máximo permitido ({capacity.maxIncomePercentage}%)</span>
        <span className="tabular-nums text-foreground">{formatPrice(capacity.maxAllowed!)}</span>
      </div>
      <div className={row}>
        <span className="text-muted-foreground">Compromiso actual</span>
        <span className="tabular-nums text-foreground">{formatPrice(capacity.currentCommitment)}</span>
      </div>
      <div className={`${row} mt-1 border-t border-border/60 pt-1 text-sm font-semibold ${capacity.exceeds ? 'text-destructive' : 'text-foreground'}`}>
        <span>Esta solicitud</span>
        <span className="tabular-nums">{formatPrice(capacity.proposedMonthlyPayment)}</span>
      </div>
      {capacity.exceeds && (
        <p className="mt-1 text-destructive">
          Supera la capacidad de pago disponible ({formatPrice(capacity.available!)}).
        </p>
      )}
    </div>
  );
}
