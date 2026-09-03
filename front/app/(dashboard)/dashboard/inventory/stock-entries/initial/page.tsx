'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2 } from 'lucide-react';
import { NumericInput } from '../../../../../../components/numeric-input';
import {
  inventoryApi,
  type StockInitialSourceType,
} from '../../../../../../lib/api/inventory';
import { warehousesApi } from '../../../../../../lib/api/warehouses';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';
const TEXTAREA_CLS = 'w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

const SOURCE_LABELS: Record<StockInitialSourceType, string> = {
  PURCHASE:   'Compra (no registrada previamente en el sistema)',
  MIGRATION:  'Migración desde otro sistema',
  PRODUCTION: 'Producción propia',
  DONATION:   'Donación',
  OTHER:      'Otro',
};

const EMPTY_FORM = {
  productId: '',
  quantity: 0,
  warehouseId: '',
  initialSourceType: '' as StockInitialSourceType | '',
  batchNumber: '',
  unitCost: 0,
  expiresAt: '',
  serialsText: '',
  notes: '',
};

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InitialStockPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['inventory-products-active'],
    queryFn: () => inventoryApi.listProducts({ isActive: true }),
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses'],
    queryFn: warehousesApi.listWarehouses,
  });

  const product = products.find((p) => p.id === form.productId) ?? null;
  const set = <K extends keyof typeof EMPTY_FORM>(k: K, v: (typeof EMPTY_FORM)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Para productos serializados, la cantidad no se tipea — surge de cuántos
  // N/S se cargaron abajo (el campo "Cantidad" queda deshabilitado y solo
  // refleja este valor, ver más abajo).
  const serialNumbers = form.serialsText.split('\n').map((s) => s.trim()).filter(Boolean);
  const effectiveQuantity = product?.isSerialized ? serialNumbers.length : Number(form.quantity);

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.createInitialStock({
        productId: form.productId,
        quantity: effectiveQuantity,
        warehouseId: form.warehouseId || undefined,
        initialSourceType: form.initialSourceType as StockInitialSourceType,
        batchNumber: product?.usesLots && form.batchNumber.trim() ? form.batchNumber.trim() : undefined,
        unitCost: product?.usesLots && form.batchNumber.trim() ? Number(form.unitCost) : undefined,
        expiresAt: product?.usesLots && form.expiresAt ? form.expiresAt : undefined,
        serialNumbers: product?.isSerialized ? serialNumbers : undefined,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-products'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      void queryClient.invalidateQueries({ queryKey: ['product-batches'] });
      setForm(EMPTY_FORM);
      setSuccess(true);
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'Error al registrar la carga inicial'));
    },
  });

  const canSubmit = !!form.productId && effectiveQuantity > 0 && !!form.initialSourceType;

  return (
    <div className="max-w-2xl">
      <div className="mb-5">
        <Link
          href="/dashboard/inventory"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft size={12} />
          Volver a Productos
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">Carga inicial de stock</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flujo propio — no pasa por Compras. Queda documentado de dónde vino este stock.
        </p>
      </div>

      {success && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-accent-on/20 bg-accent-subtle px-4 py-3 text-sm text-accent-on">
          <CheckCircle2 size={16} />
          Carga registrada correctamente.
          <button
            type="button"
            onClick={() => setSuccess(false)}
            className="ml-auto text-xs font-medium underline underline-offset-2"
          >
            Cargar otra
          </button>
        </div>
      )}

      <Card className="p-6">
        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="space-y-5"
        >
          <div className="space-y-1">
            <Label>Producto *</Label>
            <Select value={form.productId || 'none'} onValueChange={(v) => set('productId', v && v !== 'none' ? v : '')}>
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">
                  {product ? `${product.name}${product.model ? ` (${product.model})` : ''}` : '— Seleccionar producto —'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Seleccionar producto —</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}{p.model ? ` (${p.model})` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Cantidad *</Label>
              <NumericInput
                className={NUM_CLS}
                value={effectiveQuantity}
                onChange={(v) => set('quantity', Math.max(0, Math.round(v)))}
                disabled={product?.isSerialized}
              />
              {product?.isSerialized && (
                <p className="text-xs text-muted-foreground/60">La define la cantidad de N/S cargados abajo.</p>
              )}
            </div>
            <div className="space-y-1">
              <Label>Depósito</Label>
              <Select value={form.warehouseId || 'none'} onValueChange={(v) => set('warehouseId', v && v !== 'none' ? v : '')}>
                <SelectTrigger className="w-full">
                  <span className="flex-1 text-left text-sm truncate">
                    {warehouses.find((w) => w.id === form.warehouseId)?.name ?? '— Sin especificar —'}
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Sin especificar —</SelectItem>
                  {warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Origen de este stock *</Label>
            <Select
              value={form.initialSourceType || 'none'}
              onValueChange={(v) => set('initialSourceType', (v && v !== 'none' ? v : '') as StockInitialSourceType | '')}
            >
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">
                  {form.initialSourceType ? SOURCE_LABELS[form.initialSourceType] : '— Seleccionar origen —'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Seleccionar origen —</SelectItem>
                {(Object.keys(SOURCE_LABELS) as StockInitialSourceType[]).map((s) => (
                  <SelectItem key={s} value={s}>{SOURCE_LABELS[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {product?.isSerialized && (
            <div className="space-y-1">
              <Label>Números de serie (uno por línea)</Label>
              <textarea
                className={`${TEXTAREA_CLS} font-mono text-xs`}
                rows={5}
                placeholder={'SN001\nSN002'}
                value={form.serialsText}
                onChange={(e) => set('serialsText', e.target.value)}
              />
            </div>
          )}

          {product?.usesLots && !product.isSerialized && (
            <div className="rounded-xl bg-muted/20 p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                Este producto maneja lotes — opcionalmente registrá el lote inicial
              </p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Número de lote</Label>
                  <Input
                    placeholder="INICIAL-001"
                    value={form.batchNumber}
                    onChange={(e) => set('batchNumber', e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Costo unitario</Label>
                  <NumericInput
                    className={NUM_CLS}
                    value={form.unitCost}
                    onChange={(v) => set('unitCost', v)}
                    disabled={!form.batchNumber.trim()}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Vencimiento</Label>
                  <DatePicker
                    value={form.expiresAt}
                    onChange={(v) => set('expiresAt', v)}
                    disabled={!form.batchNumber.trim()}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Notas (opcional)</Label>
            <textarea
              className={TEXTAREA_CLS}
              rows={2}
              placeholder="Ej: inventario relevado al migrar del sistema anterior"
              value={form.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button type="submit" disabled={mutation.isPending || !canSubmit}>
              {mutation.isPending ? 'Registrando...' : 'Registrar carga inicial'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
