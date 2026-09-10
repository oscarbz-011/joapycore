'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hammer, Plus, X } from 'lucide-react';
import { NumericInput } from '../../../../components/numeric-input';
import { inventoryApi } from '../../../../lib/api/inventory';
import {
  productionApi,
  PRODUCTION_STATUS_LABEL,
  type ProductionOrder,
  type ProductionOrderStatus,
} from '../../../../lib/api/production';
import { warehousesApi } from '../../../../lib/api/warehouses';
import { useAuth } from '../../../../lib/auth-context';
import { formatDatePY } from '../../../../lib/date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

const NUM_CLS =
  'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

function fmtQty(n: number | string) {
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 3 }).format(Number(n));
}

const STATUS_ORDER: ProductionOrderStatus[] = [
  'DRAFT',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];

function StatusBadge({ status }: { status: ProductionOrderStatus }) {
  const label = PRODUCTION_STATUS_LABEL[status];
  if (status === 'COMPLETED')
    return <Badge className="border-accent-on/20 bg-accent-subtle text-accent-on hover:bg-accent-subtle">{label}</Badge>;
  if (status === 'IN_PROGRESS')
    return <Badge className="border-warn/30 bg-warn-subtle text-warn hover:bg-warn-subtle">{label}</Badge>;
  if (status === 'CANCELLED') return <Badge variant="destructive">{label}</Badge>;
  return <Badge variant="secondary">{label}</Badge>;
}

// ── Modal de alta ─────────────────────────────────────────────────────────────

function NewOrderModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  // Solo productos fabricados: el backend rechaza cualquier otro, así que no
  // tiene sentido ofrecerlos.
  const { data: products = [] } = useQuery({
    queryKey: ['inventory-products-manufactured'],
    queryFn: () => inventoryApi.listProducts({ status: 'ACTIVE', kind: 'MANUFACTURED' }),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: warehousesApi.listWarehouses,
  });

  const mutation = useMutation({
    mutationFn: () =>
      productionApi.createOrder({
        productId,
        quantity,
        warehouseId: warehouseId || undefined,
        notes: notes || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
      onOpenChange(false);
      setProductId('');
      setQuantity(0);
      setWarehouseId('');
      setNotes('');
      setError('');
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'No se pudo crear la orden'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="flex-row items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>Nueva orden de producción</DialogTitle>
          <Button variant="ghost" size="icon-sm" type="button" onClick={() => onOpenChange(false)}>
            <X size={16} />
          </Button>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="space-y-4 px-6 py-5"
        >
          <div>
            <Label className="mb-1 text-[12px]">Producto a fabricar *</Label>
            <Select
              value={productId || null}
              onValueChange={(v) => setProductId(v ?? '')}
            >
              <SelectTrigger className="w-full">
                <span className={cn('min-w-0 flex-1 truncate text-left text-sm', !productId && 'text-muted-foreground')}>
                  {products.find((p) => p.id === productId)?.name ?? '— Seleccionar —'}
                </span>
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {products.length === 0 && (
              <p className="mt-1 text-[12px] text-muted-foreground">
                No hay productos fabricados activos. Creá uno con tipo «Fabricado» y cargale la receta.
              </p>
            )}
          </div>

          <div>
            <Label className="mb-1 text-[12px]">Cantidad a producir *</Label>
            <NumericInput value={quantity} onChange={setQuantity} decimals={3} className={NUM_CLS} />
          </div>

          <div>
            <Label className="mb-1 text-[12px]">Depósito</Label>
            <Select
              value={warehouseId || 'none'}
              onValueChange={(v) => setWarehouseId(v && v !== 'none' ? v : '')}
            >
              <SelectTrigger className="w-full">
                <span
                  className={cn(
                    'min-w-0 flex-1 truncate text-left text-sm',
                    !warehouseId && 'text-muted-foreground',
                  )}
                >
                  {warehouses.find((w) => w.id === warehouseId)?.name ?? '— Sin especificar —'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin especificar —</SelectItem>
                {warehouses.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="mb-1 text-[12px]">Notas</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!productId || quantity <= 0 || mutation.isPending}>
              {mutation.isPending ? 'Creando…' : 'Crear orden'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal de completado ───────────────────────────────────────────────────────

function CompleteOrderModal({
  order,
  open,
  onOpenChange,
  onCompleted,
}: {
  order: ProductionOrder;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCompleted: () => void;
}) {
  // En el taller casi nunca se consume lo planificado: se arranca con ese
  // número y el operario lo corrige con lo que realmente usó.
  const [used, setUsed] = useState<Record<string, number>>(() =>
    Object.fromEntries(order.items.map((i) => [i.componentId, Number(i.plannedQuantity)])),
  );
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      productionApi.completeOrder(order.id, {
        consumptions: order.items.map((i) => ({
          componentId: i.componentId,
          usedQuantity: used[i.componentId] ?? Number(i.plannedQuantity),
        })),
      }),
    onSuccess: () => {
      onCompleted();
      onOpenChange(false);
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      // El backend revalida stock al completar y devuelve 422 con el detalle de
      // qué faltó: hay que mostrarlo acá, no cerrar el modal.
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'No se pudo completar la orden'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="flex-row items-center justify-between border-b border-border px-6 py-4">
          <DialogTitle>Completar orden #{order.orderNumber}</DialogTitle>
          <Button variant="ghost" size="icon-sm" type="button" onClick={() => onOpenChange(false)}>
            <X size={16} />
          </Button>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="max-h-[70vh] space-y-4 overflow-y-auto px-6 py-5"
        >
          <p className="text-[13px] text-muted-foreground">
            Se van a dar de alta {fmtQty(order.quantity)} {order.product.unit} de{' '}
            <strong className="text-foreground">{order.product.name}</strong>. Ajustá cuánta materia
            prima se usó de verdad; si no tocás nada se descuenta lo planificado.
          </p>

          <div className="space-y-3">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[13px] text-foreground">{item.component.name}</p>
                  <p className="text-[11.5px] text-muted-foreground">
                    Planificado: {fmtQty(item.plannedQuantity)} {item.component.unit}
                  </p>
                </div>
                <div className="flex w-36 shrink-0 items-center gap-2">
                  <NumericInput
                    value={used[item.componentId] ?? 0}
                    onChange={(v) => setUsed((prev) => ({ ...prev, [item.componentId]: v }))}
                    decimals={3}
                    className={NUM_CLS}
                  />
                  <span className="shrink-0 text-[12px] text-muted-foreground">{item.component.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? 'Completando…' : 'Completar orden'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Detalle de una orden ──────────────────────────────────────────────────────

function OrderCard({ order, canManage }: { order: ProductionOrder; canManage: boolean }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [showComplete, setShowComplete] = useState(false);

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['production-orders'] });
    // El stock cambió: refrescar también el inventario.
    void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
  };

  const onError = (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
    const msg = err?.response?.data?.message;
    setError(Array.isArray(msg) ? msg[0] : (msg ?? 'No se pudo actualizar la orden'));
  };

  const startMutation = useMutation({
    mutationFn: () => productionApi.startOrder(order.id),
    onSuccess: () => { setError(''); invalidate(); },
    onError,
  });
  const cancelMutation = useMutation({
    mutationFn: () => productionApi.cancelOrder(order.id),
    onSuccess: () => { setError(''); invalidate(); },
    onError,
  });

  const busy = startMutation.isPending || cancelMutation.isPending;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-foreground">
              #{order.orderNumber} · {order.product.name}
            </p>
            <StatusBadge status={order.status} />
          </div>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">
            {fmtQty(order.quantity)} {order.product.unit} · creada el {formatDatePY(order.createdAt, 'local')}
            {order.completedAt && <> · completada el {formatDatePY(order.completedAt, 'local')}</>}
          </p>
        </div>
        {canManage && (
          <div className="flex shrink-0 gap-2">
            {order.status === 'DRAFT' && (
              <Button size="sm" disabled={busy} onClick={() => startMutation.mutate()}>
                Iniciar
              </Button>
            )}
            {order.status === 'IN_PROGRESS' && (
              <Button size="sm" disabled={busy} onClick={() => setShowComplete(true)}>
                Completar
              </Button>
            )}
            {(order.status === 'DRAFT' || order.status === 'IN_PROGRESS') && (
              <Button size="sm" variant="outline" disabled={busy} onClick={() => cancelMutation.mutate()}>
                Cancelar
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Consumo de materia prima */}
      <div className="mt-3 space-y-1.5 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/60">
          Materia prima
        </p>
        {order.items.map((item) => (
          <div key={item.id} className="flex justify-between text-[12.5px]">
            <span className="text-muted-foreground">{item.component.name}</span>
            <span className="font-mono tabular-nums text-foreground">
              {order.status === 'COMPLETED'
                ? `${fmtQty(item.usedQuantity)} ${item.component.unit}`
                : `${fmtQty(item.plannedQuantity)} ${item.component.unit}`}
            </span>
          </div>
        ))}
      </div>

      {error && <p className="mt-2 text-[12.5px] text-destructive">{error}</p>}

      {showComplete && (
        <CompleteOrderModal
          order={order}
          open={showComplete}
          onOpenChange={setShowComplete}
          onCompleted={() => { setError(''); invalidate(); }}
        />
      )}
    </Card>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function ProductionPage() {
  const { jwtPayload } = useAuth();
  // Con solo `production:orders:read` se puede mirar pero no operar: sin esto
  // los botones estaban a la vista y devolvían 403 al tocarlos.
  const canManage = jwtPayload?.permissions.includes('production:orders:manage') ?? false;

  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState<ProductionOrderStatus | ''>('');

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ['production-orders', statusFilter],
    queryFn: () => productionApi.listOrders(statusFilter || undefined),
  });

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">Producción</h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Órdenes que consumen materia prima y dan de alta el producto terminado
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setShowCreate(true)}>
            <Plus size={15} />
            Nueva orden
          </Button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setStatusFilter('')}
          className={cn(
            'rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
            !statusFilter ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Todas
        </button>
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={cn(
              'rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors',
              statusFilter === s ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {PRODUCTION_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-[13.5px] text-muted-foreground">Cargando órdenes…</div>
      ) : orders.length === 0 ? (
        <div className="py-16 text-center">
          <Hammer size={22} className="mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-[13.5px] text-muted-foreground">
            {statusFilter ? 'No hay órdenes en este estado.' : 'Todavía no hay órdenes de producción.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} canManage={canManage} />
          ))}
        </div>
      )}

      <NewOrderModal open={showCreate} onOpenChange={setShowCreate} />
    </div>
  );
}
