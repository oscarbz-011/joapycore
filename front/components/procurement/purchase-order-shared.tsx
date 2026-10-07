'use client';

// Piezas de las órdenes de compra que comparten la lista y la pantalla de
// detalle: formato, insignias de estado y el formulario de recepción.

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api/api-error';
import { receiveAdvanceWarning } from '@/lib/advance';
import {
  procurementApi,
  type PurchaseOrder,
  type PurchaseOrderStatus,
  type PurchaseType,
  type ReceiptItemPayload,
} from '@/lib/api/procurement';
import { warehousesApi } from '@/lib/api/warehouses';
import { daysOverdue } from '@/lib/overdue';
import { PURCHASE_ORDER_STATUS_LABEL } from '@/lib/purchase-order-status';

// ── Helpers ────────────────────────────────────────────────────────────────────

export function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

export function orderTotal(order: PurchaseOrder) {
  return order.items.reduce((sum, i) => sum + Number(i.quantity) * Number(i.unitCost), 0);
}

// Mismo diseño de resaltado que Pagos/Financiamiento/Reportes: rojo si la
// entrega esperada ya pasó y la orden sigue esperando mercadería, ámbar si
// todavía está dentro de plazo. Una orden en borrador (PENDING, aún no
// confirmada al proveedor) no cuenta — la fecha ahí es solo un estimado
// propio, no un compromiso real.
export function deliveryDaysOverdue(order: PurchaseOrder): number {
  const stillOwed = order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED';
  if (!stillOwed || !order.expectedDate) return 0;
  return Math.max(0, daysOverdue(order.expectedDate));
}

export function deliveryAccentFor(order: PurchaseOrder): 'destructive' | 'warn' | null {
  const stillOwed = order.status === 'CONFIRMED' || order.status === 'PARTIALLY_RECEIVED';
  if (!stillOwed || !order.expectedDate) return null;
  return deliveryDaysOverdue(order) > 0 ? 'destructive' : 'warn';
}

export const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
export const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';


// ── Status badge ───────────────────────────────────────────────────────────────

const STATUS_MAP: Record<PurchaseOrderStatus, { label: string; className?: string; destructive?: boolean }> = {
  PENDING:              { label: PURCHASE_ORDER_STATUS_LABEL.PENDING,            className: 'bg-muted/30 text-muted-foreground border-border' },
  SENT:                 { label: PURCHASE_ORDER_STATUS_LABEL.SENT,               className: 'bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800' },
  CONFIRMED:            { label: PURCHASE_ORDER_STATUS_LABEL.CONFIRMED,          className: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800' },
  PARTIALLY_RECEIVED:   { label: PURCHASE_ORDER_STATUS_LABEL.PARTIALLY_RECEIVED, className: 'bg-warn-subtle text-warn border-warn/30' },
  RECEIVED:             { label: PURCHASE_ORDER_STATUS_LABEL.RECEIVED,           className: 'bg-accent-subtle text-accent-on border-accent-on/20' },
  CANCELLED:            { label: PURCHASE_ORDER_STATUS_LABEL.CANCELLED,          destructive: true },
};

export function StatusBadge({ status, deliveryOverdueDays }: { status: PurchaseOrderStatus; deliveryOverdueDays?: number }) {
  if (deliveryOverdueDays && deliveryOverdueDays > 0) {
    return (
      <Badge variant="destructive" className="gap-1 whitespace-nowrap">
        <AlertTriangle size={10} />
        Entrega vencida · {deliveryOverdueDays} {deliveryOverdueDays === 1 ? 'día' : 'días'}
      </Badge>
    );
  }
  const { label, className, destructive } = STATUS_MAP[status];
  return (
    <Badge variant={destructive ? 'destructive' : 'outline'} className={className}>
      {label}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: PurchaseType }) {
  return type === 'IMPORT' ? (
    <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800">
      Importación
    </Badge>
  ) : (
    <Badge variant="secondary">Local</Badge>
  );
}

// ── Receive modal (crea una recepción propia — documento separado de la OC) ────

interface ReceiptLineState {
  quantity: number;
  serials: string;
  batchNumber: string;
  expiresAt: string;
}

export function ReceiveModal({
  order,
  open,
  onOpenChange,
  onSaved,
}: {
  order: PurchaseOrder;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const pendingItems = order.items.filter((i) => i.receivedQty < i.quantity);
  const [warehouseId, setWarehouseId] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Record<string, ReceiptLineState>>(
    Object.fromEntries(
      pendingItems.map((i) => [
        i.id,
        { quantity: i.quantity - i.receivedQty, serials: '', batchNumber: '', expiresAt: '' },
      ]),
    ),
  );
  const [error, setError] = useState('');
  const advanceWarning = receiveAdvanceWarning(order.advance);

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: warehousesApi.listWarehouses,
  });

  function updateLine(itemId: string, patch: Partial<ReceiptLineState>) {
    setLines((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...patch } }));
  }

  const mutation = useMutation({
    mutationFn: () => {
      const items: ReceiptItemPayload[] = pendingItems.map((item) => {
        const line = lines[item.id];
        return {
          purchaseOrderItemId: item.id,
          quantity: Number(line.quantity),
          batchNumber: item.product.usesLots && line.batchNumber.trim() ? line.batchNumber.trim() : undefined,
          expiresAt: item.product.usesLots && line.expiresAt ? line.expiresAt : undefined,
          serialNumbers: item.product.isSerialized
            ? line.serials.split('\n').map((s) => s.trim()).filter(Boolean)
            : undefined,
        };
      });
      return procurementApi.createReceipt(order.id, {
        warehouseId: warehouseId || undefined,
        notes: notes.trim() || undefined,
        items,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['purchase-orders'] });
      void queryClient.invalidateQueries({ queryKey: ['purchase-receipts', order.id] });
      onSaved();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, 'Error al registrar recepción'));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="sm:max-w-lg p-0 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-border px-6 py-4 sticky top-0 bg-card z-10">
          <DialogTitle>Registrar recepción</DialogTitle>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
            <X size={18} />
          </Button>
        </div>

        <div className="px-6 py-5 space-y-4">
          {advanceWarning && (
            <p
              role="status"
              className="rounded-lg border border-warn/30 bg-warn-subtle px-4 py-3 text-sm text-warn"
            >
              {advanceWarning}
            </p>
          )}

          <p className="text-sm text-muted-foreground">
            Ítems pendientes para <strong className="text-foreground">{order.supplier.name}</strong>:
          </p>

          <div className="space-y-1">
            <Label>Depósito de ingreso</Label>
            <Select value={warehouseId || 'none'} onValueChange={(v) => setWarehouseId(v && v !== 'none' ? v : '')}>
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">
                  {warehouses.find((w) => w.id === warehouseId)?.name ?? '— Sin especificar —'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Sin especificar —</SelectItem>
                {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {pendingItems.map((item) => {
            const pending = item.quantity - item.receivedQty;
            const line = lines[item.id];
            return (
              <div key={item.id} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-sm font-medium text-foreground">{item.product.name}</p>
                    {item.product.model && <p className="text-xs text-muted-foreground/60">{item.product.model}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Saldo pendiente: <strong>{pending}</strong> {item.product.unit}
                  </span>
                </div>

                {item.product.isSerialized ? (
                  <div className="space-y-1">
                    <Label>Números de serie (uno por línea — la cantidad los define)</Label>
                    <textarea
                      className={`${TEXTAREA_CLS} font-mono text-xs`}
                      rows={Math.min(pending, 5)}
                      placeholder={'SN001\nSN002'}
                      value={line.serials}
                      onChange={(e) => updateLine(item.id, { serials: e.target.value })}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-1">
                      <Label>Cantidad a recibir ahora</Label>
                      <input
                        type="number"
                        min={1}
                        max={pending}
                        className={NUM_CLS}
                        value={line.quantity || ''}
                        onChange={(e) =>
                          updateLine(item.id, { quantity: Math.min(pending, parseInt(e.target.value) || 1) })
                        }
                      />
                    </div>
                    {item.product.usesLots && (
                      <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/20 p-3">
                        <div className="space-y-1">
                          <Label>Número de lote</Label>
                          <Input
                            placeholder="LOTE-001"
                            value={line.batchNumber}
                            onChange={(e) => updateLine(item.id, { batchNumber: e.target.value })}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Vencimiento (opcional)</Label>
                          <DatePicker
                            value={line.expiresAt}
                            onChange={(v) => updateLine(item.id, { expiresAt: v })}
                          />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}

          <div className="space-y-1">
            <Label>Notas (opcional)</Label>
            <textarea
              className={TEXTAREA_CLS}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => { setError(''); mutation.mutate(); }} disabled={mutation.isPending}>
              {mutation.isPending ? 'Registrando...' : 'Confirmar recepción'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
