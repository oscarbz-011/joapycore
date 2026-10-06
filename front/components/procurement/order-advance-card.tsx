'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { NumericInput } from '@/components/numeric-input';
import { RequirePermission } from '@/components/require-permission';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import {
  ADVANCE_STATE_LABEL,
  advanceMovementError,
  advanceRoom,
  advanceState,
  requiredAdvanceError,
  suggestedMovementAmount,
  type AdvanceMovementKind,
  type AdvanceState,
  type OrderAdvance,
} from '@/lib/advance';
import { apiErrorMessage } from '@/lib/api/api-error';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@/lib/api/payments';
import { procurementApi, type PurchaseOrder } from '@/lib/api/procurement';
import { formatDatePY, todayISODate } from '@/lib/date';
import { cn } from '@/lib/utils';
import { NUM_CLS, formatPrice, orderTotal } from './purchase-order-shared';

type Editing = AdvanceMovementKind | 'REQUIRED' | null;

const STATE_CLASS: Record<AdvanceState, string> = {
  none: '',
  pending: 'bg-warn-subtle text-warn border-warn/30',
  partial: 'bg-warn-subtle text-warn border-warn/30',
  covered: 'bg-accent-subtle text-accent-on border-accent-on/20',
};

const COPY: Record<Exclude<Editing, null>, { title: string; submit: string; busy: string }> = {
  ADVANCE: {
    title: 'Anticipo pagado al proveedor',
    submit: 'Registrar anticipo',
    busy: 'Registrando...',
  },
  ADVANCE_REFUND: {
    title: 'Devolución recibida del proveedor',
    submit: 'Registrar devolución',
    busy: 'Registrando...',
  },
  REQUIRED: {
    title: 'Anticipo que pide el proveedor por esta orden',
    submit: 'Guardar',
    busy: 'Guardando...',
  },
};

const NO_ADVANCE: OrderAdvance = {
  required: 0,
  paid: 0,
  refunded: 0,
  applied: 0,
  available: 0,
  pending: 0,
};

function Row({
  label,
  value,
  strong,
  className,
}: {
  label: string;
  value: number;
  strong?: boolean;
  className?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={cn('text-sm text-muted-foreground', strong && 'font-semibold')}>{label}</dt>
      <dd
        className={cn(
          'font-mono text-sm tabular-nums whitespace-nowrap text-foreground',
          strong && 'font-bold',
          className,
        )}
      >
        {formatPrice(value)}
      </dd>
    </div>
  );
}

/**
 * Anticipo de una orden: lo que el proveedor pide y lo que ya se le pagó antes
 * de recibir. Los saldos los calcula el servidor; después de cada movimiento
 * se vuelve a pedir la orden.
 */
export function OrderAdvanceCard({
  order,
  onChanged,
}: {
  order: PurchaseOrder;
  onChanged: () => void;
}) {
  const advance = order.advance ?? NO_ADVANCE;
  const total = orderTotal(order);
  const state = advanceState(advance);
  const movements = order.advancePayments ?? [];

  const [editing, setEditing] = useState<Editing>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<PaymentMethod>('BANK_TRANSFER');
  const [date, setDate] = useState(todayISODate());
  const [reference, setReference] = useState('');
  const [error, setError] = useState('');

  // Cancelada: no se le adelanta nada. Recibida completa: lo que queda se paga
  // desde Cuentas por pagar. La devolución sigue disponible si hay saldo.
  const open = order.status !== 'CANCELLED' && order.status !== 'RECEIVED';
  const canPay = open && advanceRoom(advance, total) > 0;
  const canRefund = advance.available > 0.01;

  function start(next: Exclude<Editing, null>) {
    setError('');
    setReference('');
    setDate(todayISODate());
    setAmount(
      next === 'REQUIRED'
        ? Math.round(advance.required)
        : suggestedMovementAmount(next, advance, total),
    );
    setEditing(next);
  }

  const mutation = useMutation({
    mutationFn: () => {
      if (editing === 'REQUIRED') return procurementApi.setOrderAdvance(order.id, amount);
      const dto = {
        amount,
        paymentMethod: method,
        paymentDate: date,
        reference: reference.trim() || undefined,
      };
      return editing === 'ADVANCE'
        ? procurementApi.payOrderAdvance(order.id, dto)
        : procurementApi.refundOrderAdvance(order.id, dto);
    },
    onSuccess: () => {
      setEditing(null);
      onChanged();
    },
    onError: (err) => {
      setError(apiErrorMessage(err, 'No se pudo guardar'));
      // Otro usuario pudo haber registrado un pago: el saldo visto ya no vale.
      onChanged();
    },
  });

  function submit() {
    if (!editing) return;
    const problem =
      editing === 'REQUIRED'
        ? requiredAdvanceError(amount, total)
        : advanceMovementError(editing, amount, advance, total);
    setError(problem ?? '');
    if (!problem) mutation.mutate();
  }

  return (
    <Card className="gap-3 p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Anticipo
        </h2>
        {state !== 'none' && (
          <Badge variant="outline" className={STATE_CLASS[state]}>
            {ADVANCE_STATE_LABEL[state]}
          </Badge>
        )}
      </div>

      {state === 'none' ? (
        <p className="text-sm text-muted-foreground">
          Esta orden no pide anticipo: se paga después de recibir la mercadería.
        </p>
      ) : (
        <dl className="space-y-1.5">
          <Row label="Pide el proveedor" value={advance.required} />
          <Row label="Pagado" value={advance.paid} />
          {advance.refunded > 0 && <Row label="Devuelto" value={advance.refunded} />}
          {advance.applied > 0 && (
            <Row label="Descontado de recepciones" value={advance.applied} />
          )}
          <div className="space-y-1.5 border-t border-border pt-1.5">
            {advance.pending > 0 && (
              <Row label="Falta pagar" value={advance.pending} strong className="text-warn" />
            )}
            <Row label="Saldo a favor" value={advance.available} strong />
          </div>
        </dl>
      )}

      {movements.length > 0 && (
        <ul className="space-y-2 border-t border-border pt-3">
          {movements.map((movement) => (
            <li key={movement.id} className="rounded-lg bg-muted/30 px-3 py-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">
                  {movement.kind === 'ADVANCE_REFUND' ? 'Devolución' : 'Anticipo'}
                </span>
                <span className="font-mono text-sm tabular-nums whitespace-nowrap text-foreground">
                  {movement.kind === 'ADVANCE_REFUND' ? '− ' : ''}
                  {formatPrice(Number(movement.amount))}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatDatePY(movement.paymentDate, 'utc')} ·{' '}
                {PAYMENT_METHOD_LABELS[movement.paymentMethod]}
                {movement.reference ? ` · ${movement.reference}` : ''}
                {movement.createdBy &&
                  ` · ${movement.createdBy.firstName} ${movement.createdBy.lastName}`}
              </p>
            </li>
          ))}
        </ul>
      )}

      {editing === null ? (
        <div className="space-y-2">
          <RequirePermission permission="procurement:payables:register">
            {canPay && (
              <Button
                className="w-full"
                variant={advance.pending > 0 ? 'default' : 'outline'}
                onClick={() => start('ADVANCE')}
              >
                Registrar anticipo pagado
              </Button>
            )}
            {canRefund && (
              <Button className="w-full" variant="outline" onClick={() => start('ADVANCE_REFUND')}>
                Registrar devolución del proveedor
              </Button>
            )}
          </RequirePermission>
          <RequirePermission permission="procurement:update">
            {open && (
              <Button className="w-full" variant="ghost" onClick={() => start('REQUIRED')}>
                Cambiar el anticipo que pide
              </Button>
            )}
          </RequirePermission>
        </div>
      ) : (
        <form
          className="space-y-3 rounded-xl border border-border bg-muted/20 px-4 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <p className="text-xs text-muted-foreground">{COPY[editing].title}</p>
          <div className="space-y-1.5">
            <Label htmlFor="advance-amount" className="text-xs">
              Monto (Gs.)
            </Label>
            <NumericInput
              id="advance-amount"
              autoFocus
              value={amount}
              onChange={setAmount}
              className={NUM_CLS}
              aria-describedby="advance-amount-help"
            />
            <p id="advance-amount-help" className="text-xs text-muted-foreground">
              {editing === 'ADVANCE_REFUND'
                ? `Hasta ${formatPrice(advance.available)}, el saldo a favor.`
                : editing === 'ADVANCE'
                  ? `Hasta ${formatPrice(advanceRoom(advance, total))}, lo que falta del total de la orden.`
                  : `0 = sin anticipo. Hasta ${formatPrice(total)}, el total de la orden.`}
            </p>
          </div>
          {editing !== 'REQUIRED' && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs">Fecha</Label>
                <DatePicker value={date} onChange={setDate} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Método de pago</Label>
                <Select value={method} onValueChange={(v) => setMethod(v as PaymentMethod)}>
                  <SelectTrigger className="w-full" aria-label="Método de pago">
                    <span className="flex-1 truncate text-left text-sm">
                      {PAYMENT_METHOD_LABELS[method]}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((key) => (
                      <SelectItem key={key} value={key}>
                        {PAYMENT_METHOD_LABELS[key]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="advance-reference" className="text-xs">
                  Referencia / comprobante
                </Label>
                <Input
                  id="advance-reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="N° de transferencia, recibo..."
                />
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? COPY[editing].busy : COPY[editing].submit}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => setEditing(null)}
              disabled={mutation.isPending}
            >
              Volver
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
