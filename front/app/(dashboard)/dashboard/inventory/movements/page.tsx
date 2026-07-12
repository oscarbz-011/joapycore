'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Package, Plus, Settings, X } from 'lucide-react';
import { NumericInput } from '../../../../../components/numeric-input';
import {
  inventoryApi,
  type MovementReason,
  type CreateGlobalMovementPayload,
} from '../../../../../lib/api/inventory';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat('es-PY', {
    dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(iso));
}

function fmtQty(quantity: number) {
  return quantity > 0 ? `+${quantity}` : String(quantity);
}

const REASON_LABELS: Record<MovementReason, string> = {
  PURCHASE:        'Ingreso de compra',
  CUSTOMER_RETURN: 'Devolución de cliente',
  ADJUSTMENT:      'Ajuste de inventario',
  TRANSFER:        'Transferencia',
  INITIAL:         'Stock inicial',
  SALE_OUT:        'Salida por venta',
  SALE_REVERSAL:   'Reversión de venta',
};

const MANUAL_REASONS: MovementReason[] = ['PURCHASE', 'CUSTOMER_RETURN', 'ADJUSTMENT', 'TRANSFER'];

// ── Tab nav ────────────────────────────────────────────────────────────────────

function InventoryNav({ active }: { active: 'products' | 'movements' | 'config' }) {
  const items = [
    { key: 'products'  as const, label: 'Productos',      href: '/dashboard/inventory',            icon: Package        },
    { key: 'movements' as const, label: 'Movimientos',    href: '/dashboard/inventory/movements',  icon: ArrowLeftRight },
    { key: 'config'    as const, label: 'Configuración',  href: '/dashboard/inventory/config',     icon: Settings       },
  ];
  return (
    <div className="flex border-b border-border mb-5">
      {items.map(({ key, label, href, icon: Icon }) => (
        <Link
          key={key}
          href={href}
          className={`flex items-center gap-1.5 px-[14px] py-[10px] text-[13.5px] font-medium border-b-2 -mb-px transition-colors ${
            active === key
              ? 'border-accent text-ink'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Icon size={14} />
          {label}
        </Link>
      ))}
    </div>
  );
}

// ── New movement modal ─────────────────────────────────────────────────────────

function NewMovementModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateGlobalMovementPayload>({
    productId: '',
    reason: 'PURCHASE',
    quantity: 0,
    direction: 'IN',
    warehouseId: undefined,
    toWarehouseId: undefined,
    notes: '',
  });
  const [error, setError] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: () => inventoryApi.listProductsWithStock({ isActive: true }),
  });

  const mutation = useMutation({
    mutationFn: () => inventoryApi.createMovement({
      ...form,
      notes: form.notes || undefined,
      warehouseId: form.warehouseId || undefined,
      toWarehouseId: form.toWarehouseId || undefined,
      direction: form.reason === 'ADJUSTMENT' ? form.direction : undefined,
    }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      onClose();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al registrar movimiento'));
    },
  });

  const inp = 'w-full rounded-[9px] border border-border bg-surface text-ink px-3 py-2 text-[13.5px] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent';
  const lbl = 'block text-[12px] font-medium text-muted mb-1';

  const set = <K extends keyof CreateGlobalMovementPayload>(k: K, v: CreateGlobalMovementPayload[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-[18px] bg-surface shadow-[var(--shadow-lg)]">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-[15px] font-bold text-ink">Registrar movimiento</h2>
          <button onClick={onClose} className="rounded-[8px] p-1.5 text-muted hover:bg-surface-2">
            <X size={17} />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="px-6 py-5 space-y-4"
        >
          <div>
            <label className={lbl}>Producto *</label>
            <select
              className={inp}
              value={form.productId}
              onChange={(e) => set('productId', e.target.value)}
              required
            >
              <option value="">— Seleccionar —</option>
              {products
                .filter((p) => !p.isSerialized)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.model ? ` — ${p.model}` : ''}
                  </option>
                ))}
            </select>
            <p className="mt-1 text-[11px] text-faint">Los productos serializados gestionan el stock por número de serie.</p>
          </div>

          <div>
            <label className={lbl}>Motivo *</label>
            <select
              className={inp}
              value={form.reason}
              onChange={(e) => set('reason', e.target.value as MovementReason)}
              required
            >
              {MANUAL_REASONS.map((r) => (
                <option key={r} value={r}>{REASON_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={lbl}>Cantidad *</label>
              <NumericInput
                value={form.quantity}
                onChange={(v) => set('quantity', Math.max(1, Math.round(v)))}
                className={inp}
                required
              />
            </div>

            {form.reason === 'ADJUSTMENT' && (
              <div>
                <label className={lbl}>Dirección *</label>
                <div className="flex gap-2">
                  {(['IN', 'OUT'] as const).map((d) => (
                    <label
                      key={d}
                      className={`flex-1 flex items-center justify-center rounded-[9px] border px-3 py-2 text-[13px] font-medium cursor-pointer transition-colors ${
                        form.direction === d
                          ? 'border-ink bg-ink text-canvas'
                          : 'border-border text-muted hover:border-border-strong'
                      }`}
                    >
                      <input
                        type="radio" className="sr-only"
                        checked={form.direction === d}
                        onChange={() => set('direction', d)}
                      />
                      {d === 'IN' ? '+ Agregar' : '− Reducir'}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {form.reason === 'TRANSFER' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={lbl}>Depósito origen</label>
                <input
                  className={inp}
                  placeholder="ID del depósito origen"
                  value={form.warehouseId ?? ''}
                  onChange={(e) => set('warehouseId', e.target.value || undefined)}
                />
              </div>
              <div>
                <label className={lbl}>Depósito destino *</label>
                <input
                  className={inp}
                  placeholder="ID del depósito destino"
                  value={form.toWarehouseId ?? ''}
                  onChange={(e) => set('toWarehouseId', e.target.value || undefined)}
                  required
                />
              </div>
            </div>
          ) : (
            <div>
              <label className={lbl}>Depósito (opcional)</label>
              <input
                className={inp}
                placeholder="ID del depósito"
                value={form.warehouseId ?? ''}
                onChange={(e) => set('warehouseId', e.target.value || undefined)}
              />
            </div>
          )}

          <div>
            <label className={lbl}>Notas (opcional)</label>
            <input
              className={inp}
              placeholder="Ej: recepción factura #001"
              value={form.notes ?? ''}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-[9px] border border-danger-subtle bg-danger-subtle px-4 py-3 text-[13px] text-danger">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[9px] border border-border px-4 py-2 text-[13.5px] text-ink hover:bg-surface-2"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={mutation.isPending || !form.productId || form.quantity < 1}
              className="rounded-[9px] px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {mutation.isPending ? 'Registrando...' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MovementsPage() {
  const [showNew, setShowNew] = useState(false);
  const [reasonFilter, setReasonFilter] = useState<MovementReason | ''>('');

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ['inventory-movements', reasonFilter],
    queryFn: () => inventoryApi.listMovements({ reason: reasonFilter || undefined, take: 100 }),
  });

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-ink">Inventario</h1>
          <p className="mt-[4px] text-[14px] text-muted">Historial de movimientos de stock</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 rounded-[10px] px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_2px_8px_rgba(16,185,129,0.3)]"
          style={{ background: 'var(--accent)' }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--accent-strong)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; }}
        >
          <Plus size={15} />
          Nuevo movimiento
        </button>
      </div>

      <InventoryNav active="movements" />

      {/* Filters */}
      <div className="mb-4 flex items-center gap-3">
        <select
          className="rounded-[9px] border border-border bg-surface px-3 py-2 text-[13.5px] text-ink focus:border-accent focus:outline-none"
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value as MovementReason | '')}
        >
          <option value="">Todos los motivos</option>
          {(Object.keys(REASON_LABELS) as MovementReason[]).map((r) => (
            <option key={r} value={r}>{REASON_LABELS[r]}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-[13.5px] text-faint">Cargando movimientos...</div>
      ) : movements.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-[13.5px] text-faint">No hay movimientos registrados.</p>
          <button onClick={() => setShowNew(true)} className="mt-3 text-[13.5px] font-medium text-accent-on underline underline-offset-2">
            Registrar el primero
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-[14px] border border-border bg-surface shadow-[var(--shadow-sm)]">
          <table className="w-full text-[13.5px]">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Fecha</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Producto</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Motivo</th>
                <th className="px-4 py-3 text-right text-[11px] font-bold uppercase tracking-wider text-faint">Cantidad</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Depósito</th>
                <th className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-faint">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {movements.map((m) => (
                <tr key={m.id} className="hover:bg-surface-2">
                  <td className="px-4 py-3 text-[12.5px] text-muted tabular-nums whitespace-nowrap">
                    {fmtDate(m.createdAt)}
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-ink">{m.product.name}</p>
                    {m.product.model && <p className="font-mono text-[11.5px] text-faint">{m.product.model}</p>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-[6px] bg-surface-2 px-2 py-0.5 text-[12px] font-medium text-muted">
                      {m.reason ? REASON_LABELS[m.reason] : m.type}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-mono font-bold tabular-nums ${m.quantity > 0 ? 'text-accent-on' : 'text-danger'}`}>
                    {fmtQty(m.quantity)}
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-muted">
                    {m.warehouse?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-[12.5px] text-muted max-w-[200px] truncate">
                    {m.notes ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showNew && <NewMovementModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
