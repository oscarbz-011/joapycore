'use client';

import type { SettlementMode } from '@/lib/api/billing';
import { PAYMENT_METHOD_LABELS, PAYMENT_METHODS, type PaymentMethod } from '@/lib/payment-methods';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export interface SettlementDraft {
  mode: SettlementMode | null;
  method: PaymentMethod | null;
  reference: string;
}

export const EMPTY_SETTLEMENT: SettlementDraft = { mode: null, method: null, reference: '' };

/** Por qué todavía no está resuelto qué pasa con la plata, o null. */
export function settlementProblem(draft: SettlementDraft): string | null {
  if (!draft.mode) return 'Elegí si la plata queda como saldo a favor o se le devuelve al cliente';
  if (draft.mode === 'REFUND' && !draft.method) return 'Elegí cómo se le devuelve el dinero';
  return null;
}

const money = (n: number) =>
  `Gs. ${new Intl.NumberFormat('es-PY', { maximumFractionDigits: 0 }).format(n)}`;

/** Qué pasa con la plata que el cliente ya pagó y deja de deber. */
export function SettlementFields({
  amount,
  customerName,
  value,
  onChange,
  disabled,
}: Readonly<{
  amount: number;
  /** Null si la factura es "Sin Nombre": solo se puede devolver. */
  customerName: string | null;
  value: SettlementDraft;
  onChange: (next: SettlementDraft) => void;
  disabled?: boolean;
}>) {
  const options: { mode: SettlementMode; title: string; help: string; enabled: boolean }[] = [
    {
      mode: 'CUSTOMER_CREDIT',
      title: 'Saldo a favor del cliente',
      help: customerName
        ? `Queda a favor de ${customerName} para una próxima compra o cuota.`
        : 'La factura no tiene un cliente identificado.',
      enabled: Boolean(customerName),
    },
    {
      mode: 'REFUND',
      title: 'Devolverle el dinero',
      help: 'Se registra cómo se le devolvió.',
      enabled: true,
    },
  ];

  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="text-sm text-foreground">
        El cliente ya pagó <span className="font-semibold tabular-nums">{money(amount)}</span> de lo
        que se acredita. ¿Qué pasa con esa plata?
      </legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const selected = value.mode === option.mode;
          return (
            <button
              key={option.mode}
              type="button"
              disabled={!option.enabled || disabled}
              aria-pressed={selected}
              onClick={() => onChange({ ...value, mode: option.mode })}
              className={cn(
                'rounded-2xl border px-4 py-3 text-left transition-colors',
                'focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
                selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/20',
              )}
            >
              <span className="block text-sm font-medium text-foreground">{option.title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{option.help}</span>
            </button>
          );
        })}
      </div>

      {value.mode === 'REFUND' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="refund-method">
              Cómo se devuelve <span className="text-destructive">*</span>
            </Label>
            <Select
              value={value.method ?? 'none'}
              onValueChange={(v) =>
                onChange({ ...value, method: v && v !== 'none' ? (v as PaymentMethod) : null })
              }
            >
              <SelectTrigger id="refund-method" className="w-full">
                <span className="flex-1 truncate text-left text-sm">
                  {value.method ? PAYMENT_METHOD_LABELS[value.method] : '— Elegí —'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-reference">Referencia</Label>
            <Input
              id="refund-reference"
              maxLength={120}
              value={value.reference}
              onChange={(e) => onChange({ ...value, reference: e.target.value })}
              placeholder="N° de transferencia, recibo…"
            />
          </div>
        </div>
      )}
    </fieldset>
  );
}
