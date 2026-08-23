'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorClosed, DoorOpen, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import {
  posApi,
  type CreatePosSaleItem,
  type CreatePosSalePayment,
  type PosPaymentMethod,
  type PosSession,
} from '../../../../lib/api/pos';
import { inventoryApi, type ProductWithStock } from '../../../../lib/api/inventory';
import { salesApi } from '../../../../lib/api/sales';
import { SearchSelect } from '../components/search-select';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';

const PAYMENT_METHOD_LABELS: Record<PosPaymentMethod, string> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Tarjeta',
  PAGO_EXPRESS: 'Pago Express',
  AQUI_PAGO: 'Aquí Pago',
  CHECK: 'Cheque',
};

function money(n: number) {
  return new Intl.NumberFormat('es-PY', {
    style: 'currency',
    currency: 'PYG',
    maximumFractionDigits: 0,
  }).format(n || 0);
}

const inp =
  'w-full rounded-lg border border-border bg-card text-foreground px-3 py-2 text-sm focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring/30';
const lbl = 'block text-xs font-medium text-muted-foreground mb-1';

// ── Open session ─────────────────────────────────────────────────────────────

function OpenSessionForm() {
  const queryClient = useQueryClient();
  const { data: terminals = [], isLoading } = useQuery({
    queryKey: ['pos-terminals'],
    queryFn: posApi.listTerminals,
  });
  const [terminalId, setTerminalId] = useState('');
  const [openingCash, setOpeningCash] = useState('');

  const openMutation = useMutation({
    mutationFn: () => posApi.openSession({ terminalId, openingCash: Number(openingCash) }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pos-active-session'] });
    },
  });

  const activeTerminals = terminals.filter((t) => t.isActive);

  return (
    <div className="mx-auto max-w-md space-y-6 py-16">
      <div className="space-y-1 text-center">
        <DoorOpen size={28} className="mx-auto text-primary" />
        <h1 className="text-lg font-semibold text-foreground">Abrir caja</h1>
        <p className="text-sm text-muted-foreground">
          Elegí una caja y el monto inicial para empezar a vender.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          openMutation.mutate();
        }}
        className="space-y-4 rounded-[14px] border border-border bg-card p-5"
      >
        <div>
          <label className={lbl}>Caja</label>
          {isLoading ? (
            <div className="h-9 animate-pulse rounded-lg bg-muted/30" />
          ) : activeTerminals.length === 0 ? (
            <p className="text-sm text-muted-foreground/60">
              No hay cajas activas. Creá una en Ajustes → Cajas.
            </p>
          ) : (
            <select
              value={terminalId}
              onChange={(e) => setTerminalId(e.target.value)}
              required
              className={inp}
            >
              <option value="" disabled>
                Seleccionar caja
              </option>
              {activeTerminals.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.branch.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <label className={lbl}>Monto inicial de efectivo</label>
          <input
            type="number"
            min={0}
            step="1"
            required
            value={openingCash}
            onChange={(e) => setOpeningCash(e.target.value)}
            placeholder="0"
            className={inp}
          />
        </div>

        {openMutation.isError && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {(openMutation.error as Error & { response?: { data?: { message?: string } } })
              ?.response?.data?.message ?? 'No se pudo abrir la caja'}
          </div>
        )}

        <Button type="submit" disabled={openMutation.isPending || !terminalId} className="w-full">
          {openMutation.isPending ? 'Abriendo...' : 'Abrir caja'}
        </Button>
      </form>
    </div>
  );
}

// ── Close session dialog ─────────────────────────────────────────────────────

function CloseSessionDialog({
  session,
  open,
  onOpenChange,
}: {
  session: PosSession;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [closingCash, setClosingCash] = useState('');
  const [notes, setNotes] = useState('');

  const closeMutation = useMutation({
    mutationFn: () =>
      posApi.closeSession(session.id, { closingCash: Number(closingCash), notes: notes || undefined }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pos-active-session'] });
    },
  });

  function handleDone() {
    onOpenChange(false);
    setClosingCash('');
    setNotes('');
    closeMutation.reset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleDone()}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Cerrar caja</DialogTitle>

        {closeMutation.isSuccess ? (
          <div className="space-y-4 pt-2">
            <div
              className={`rounded-lg border px-3 py-3 text-sm ${
                closeMutation.data.status === 'DISCREPANCY'
                  ? 'border-warn/30 bg-warn-subtle text-warn'
                  : 'border-primary/30 bg-primary/5 text-foreground'
              }`}
            >
              <p className="font-medium">
                {closeMutation.data.status === 'DISCREPANCY'
                  ? 'Caja cerrada con diferencia'
                  : 'Caja cerrada correctamente'}
              </p>
              <p className="mt-1 text-xs">
                Esperado: {money(closeMutation.data.expectedCash ?? 0)} · Contado:{' '}
                {money(closeMutation.data.closingCash ?? 0)}
                {closeMutation.data.difference
                  ? ` · Diferencia: ${money(closeMutation.data.difference)}`
                  : ''}
              </p>
            </div>
            <Button className="w-full" onClick={handleDone}>
              Listo
            </Button>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              closeMutation.mutate();
            }}
            className="space-y-4 pt-2"
          >
            <div>
              <label className={lbl}>Efectivo contado</label>
              <input
                type="number"
                min={0}
                required
                autoFocus
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className={inp}
              />
            </div>
            <div>
              <label className={lbl}>Notas (opcional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                className={inp}
              />
            </div>
            {closeMutation.isError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                No se pudo cerrar la caja
              </div>
            )}
            <Button type="submit" disabled={closeMutation.isPending} className="w-full">
              {closeMutation.isPending ? 'Cerrando...' : 'Cerrar caja'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Cart ──────────────────────────────────────────────────────────────────────

interface CartLine {
  key: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  isSerialized: boolean;
  serialNumbers: string[];
  stock: number;
}

interface PaymentLine {
  key: string;
  method: PosPaymentMethod;
  amount: number;
}

function SaleScreen({ session }: { session: PosSession }) {
  const queryClient = useQueryClient();
  const { data: products = [] } = useQuery({
    queryKey: ['products-with-stock'],
    queryFn: () => inventoryApi.listProductsWithStock({ isActive: true }),
  });
  const { data: customers = [] } = useQuery({
    queryKey: ['customers'],
    queryFn: salesApi.listCustomers,
  });
  const { data: sessionSales = [] } = useQuery({
    queryKey: ['pos-session-sales', session.id],
    queryFn: () => posApi.listSessionSales(session.id),
  });

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [payments, setPayments] = useState<PaymentLine[]>([{ key: 'p0', method: 'CASH', amount: 0 }]);
  const [closeOpen, setCloseOpen] = useState(false);
  const [error, setError] = useState('');

  const total = cart.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0);
  const paidTotal = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

  function addProduct(product: ProductWithStock) {
    setCart((c) => {
      const existing = !product.isSerialized ? c.find((l) => l.productId === product.id) : undefined;
      if (existing) {
        return c.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...c,
        {
          key: `${product.id}-${Date.now()}`,
          productId: product.id,
          name: product.name,
          quantity: 1,
          unitPrice: Number(product.salePrice),
          isSerialized: product.isSerialized,
          serialNumbers: [],
          stock: product.stock,
        },
      ];
    });
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart((c) => c.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function removeLine(key: string) {
    setCart((c) => c.filter((l) => l.key !== key));
  }

  const saleMutation = useMutation({
    mutationFn: () => {
      const items: CreatePosSaleItem[] = cart.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        ...(l.isSerialized ? { serialNumbers: l.serialNumbers } : {}),
      }));
      const paymentsPayload: CreatePosSalePayment[] = payments
        .filter((p) => p.amount > 0)
        .map((p) => ({ amount: p.amount, paymentMethod: p.method }));
      return posApi.createSale({ customerId: customerId || undefined, items, payments: paymentsPayload });
    },
    onSuccess: () => {
      setCart([]);
      setCustomerId('');
      setPayments([{ key: 'p0', method: 'CASH', amount: 0 }]);
      setError('');
      void queryClient.invalidateQueries({ queryKey: ['pos-session-sales', session.id] });
      void queryClient.invalidateQueries({ queryKey: ['products-with-stock'] });
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'No se pudo completar la venta'));
    },
  });

  function chargeExact() {
    setPayments([{ key: 'p0', method: payments[0]?.method ?? 'CASH', amount: total }]);
  }

  const serialsOk = cart.every((l) => !l.isSerialized || l.serialNumbers.length === l.quantity);
  const canCharge = cart.length > 0 && total > 0 && paidTotal >= total && serialsOk;

  return (
    <div className="space-y-6">
      {/* Session header */}
      <div className="flex items-center justify-between gap-4 rounded-[14px] border border-border bg-card px-5 py-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{session.terminal.name}</p>
          <p className="text-xs text-muted-foreground">
            Abierta {new Date(session.openedAt).toLocaleString('es-PY')} · Apertura{' '}
            {money(session.openingCash)}
          </p>
        </div>
        <Button variant="outline" onClick={() => setCloseOpen(true)}>
          <DoorClosed size={15} /> Cerrar caja
        </Button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Product picker + cart */}
        <div className="space-y-4">
          <div className="rounded-[14px] border border-border bg-card p-4">
            <label className={lbl}>Agregar producto</label>
            <SearchSelect
              items={products.filter((p) => p.stock > 0)}
              value=""
              onChange={(_, product) => product && addProduct(product)}
              getKey={(p) => p.id}
              getLabel={(p) => p.name}
              getDescription={(p) => `${money(p.salePrice)} · Stock: ${p.stock}`}
              filterFn={(p, q) =>
                p.name.toLowerCase().includes(q.toLowerCase()) ||
                (p.model ?? '').toLowerCase().includes(q.toLowerCase())
              }
              placeholder="Buscar producto por nombre o modelo..."
              emptyMessage="Sin productos con stock"
            />
          </div>

          <div className="overflow-hidden rounded-[14px] border border-border bg-card">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <ShoppingCart size={28} className="mb-2 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground/60">El carrito está vacío</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {cart.map((line) => (
                  <div key={line.key} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{line.name}</p>
                      {line.isSerialized && (
                        <input
                          className="mt-1 w-full rounded border border-border bg-background px-2 py-1 text-xs"
                          placeholder={`N/S separados por coma (${line.quantity} requerido${line.quantity > 1 ? 's' : ''})`}
                          value={line.serialNumbers.join(', ')}
                          onChange={(e) =>
                            updateLine(line.key, {
                              serialNumbers: e.target.value
                                .split(',')
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => updateLine(line.key, { quantity: Math.max(1, line.quantity - 1) })}
                        className="rounded p-1 text-muted-foreground hover:bg-muted/20"
                      >
                        <Minus size={13} />
                      </button>
                      <span className="w-6 text-center text-sm">{line.quantity}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateLine(line.key, { quantity: Math.min(line.stock, line.quantity + 1) })
                        }
                        className="rounded p-1 text-muted-foreground hover:bg-muted/20"
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    <p className="w-24 shrink-0 text-right text-sm font-medium text-foreground">
                      {money(line.quantity * line.unitPrice)}
                    </p>
                    <button
                      type="button"
                      onClick={() => removeLine(line.key)}
                      className="shrink-0 text-muted-foreground/60 hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Checkout panel */}
        <div className="space-y-4">
          <div className="space-y-3 rounded-[14px] border border-border bg-card p-4">
            <label className={lbl}>Cliente (opcional)</label>
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={inp}>
              <option value="">Consumidor Final</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} {c.lastName}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3 rounded-[14px] border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">Total</p>
              <p className="text-lg font-semibold text-foreground">{money(total)}</p>
            </div>

            <div className="space-y-2">
              {payments.map((p, i) => (
                <div key={p.key} className="flex items-center gap-2">
                  <select
                    value={p.method}
                    onChange={(e) =>
                      setPayments((ps) =>
                        ps.map((x, idx) => (idx === i ? { ...x, method: e.target.value as PosPaymentMethod } : x)),
                      )
                    }
                    className="flex-1 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={p.amount || ''}
                    onChange={(e) =>
                      setPayments((ps) => ps.map((x, idx) => (idx === i ? { ...x, amount: Number(e.target.value) } : x)))
                    }
                    placeholder="0"
                    className="w-28 rounded-lg border border-border bg-card px-2 py-1.5 text-xs text-foreground"
                  />
                  {payments.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setPayments((ps) => ps.filter((_, idx) => idx !== i))}
                      className="text-muted-foreground/60 hover:text-destructive"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setPayments((ps) => [...ps, { key: `p${ps.length}-${Date.now()}`, method: 'CASH', amount: 0 }])}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  + Agregar pago
                </button>
                <button
                  type="button"
                  onClick={chargeExact}
                  className="text-xs font-medium text-muted-foreground hover:text-foreground"
                >
                  Cobrar exacto
                </button>
              </div>
            </div>

            {total > 0 && paidTotal !== total && (
              <p className="text-xs text-muted-foreground">
                {paidTotal < total ? `Faltan ${money(total - paidTotal)}` : `Vuelto ${money(paidTotal - total)}`}
              </p>
            )}

            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </div>
            )}

            <Button
              className="w-full"
              disabled={!canCharge || saleMutation.isPending}
              onClick={() => {
                setError('');
                saleMutation.mutate();
              }}
            >
              {saleMutation.isPending ? 'Procesando...' : 'Cobrar'}
            </Button>
          </div>

          {sessionSales.length > 0 && (
            <div className="rounded-[14px] border border-border bg-card p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                Ventas de esta sesión ({sessionSales.length})
              </p>
              <div className="max-h-48 space-y-1.5 overflow-y-auto">
                {sessionSales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      {new Date(s.orderDate).toLocaleTimeString('es-PY', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="font-medium text-foreground">
                      {money(s.items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0))}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <CloseSessionDialog session={session} open={closeOpen} onOpenChange={setCloseOpen} />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PosPage() {
  const { data: session, isLoading } = useQuery({
    queryKey: ['pos-active-session'],
    queryFn: posApi.getActiveSession,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return session ? <SaleScreen session={session} /> : <OpenSessionForm />;
}
