'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Boxes } from 'lucide-react';
import { inventoryApi } from '../../../../../lib/api/inventory';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC',
  });
}

function fmtPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

function isExpiringSoon(iso: string | null) {
  if (!iso) return false;
  const days = (new Date(iso).getTime() - Date.now()) / 86_400_000;
  return days >= 0 && days <= 30;
}

function isExpired(iso: string | null) {
  if (!iso) return false;
  return new Date(iso).getTime() < Date.now();
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function BatchesPage() {
  const [productId, setProductId] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['inventory-products-active'],
    queryFn: () => inventoryApi.listProducts({ isActive: true }),
  });

  const { data: batches = [], isLoading } = useQuery({
    queryKey: ['product-batches', productId],
    queryFn: () => inventoryApi.listAllBatches(productId ? { productId } : undefined),
  });

  const lotManagedProducts = products.filter((p) => p.usesLots);

  return (
    <div>
      <div className="mb-5">
        <Link
          href="/dashboard/inventory"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2"
        >
          <ArrowLeft size={12} />
          Volver a Productos
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">Lotes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Trazabilidad de mercadería por lote — reposición y carga inicial
        </p>
      </div>

      <div className="mb-4">
        <Select value={productId || 'all'} onValueChange={(v) => setProductId(v && v !== 'all' ? v : '')}>
          <SelectTrigger className="w-64">
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {productId ? products.find((p) => p.id === productId)?.name : 'Todos los productos'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los productos</SelectItem>
            {lotManagedProducts.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}{p.model ? ` (${p.model})` : ''}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando lotes...</div>
      ) : batches.length === 0 ? (
        <div className="py-16 text-center">
          <Boxes className="mx-auto mb-3 text-muted-foreground/40" size={32} />
          <p className="text-sm text-muted-foreground">
            {productId ? 'Este producto todavía no tiene lotes cargados.' : 'Todavía no hay lotes cargados.'}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Se crean al recibir una compra o al hacer una carga inicial de un producto que maneja lotes.
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Lote</th>
                  <th className="px-4 py-3 text-left">Ingreso</th>
                  <th className="px-4 py-3 text-left">Vencimiento</th>
                  <th className="px-4 py-3 text-right">Costo unit.</th>
                  <th className="px-4 py-3 text-right">Original</th>
                  <th className="px-4 py-3 text-right">Restante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {batches.map((batch) => {
                  const expired = isExpired(batch.expiresAt);
                  const expiringSoon = !expired && isExpiringSoon(batch.expiresAt);
                  const depleted = batch.remainingQty <= 0;
                  return (
                    <tr key={batch.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-foreground">{batch.product?.name}</div>
                        {batch.product?.model && (
                          <div className="text-xs text-muted-foreground/60">{batch.product.model}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{batch.batchNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">{fmtDate(batch.entryDate)}</td>
                      <td className="px-4 py-3">
                        {expired ? (
                          <Badge variant="destructive">Vencido · {fmtDate(batch.expiresAt)}</Badge>
                        ) : expiringSoon ? (
                          <Badge variant="outline" className="bg-warn-subtle text-warn border-warn/30">
                            Vence pronto · {fmtDate(batch.expiresAt)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">{fmtDate(batch.expiresAt)}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground tabular-nums">
                        {fmtPrice(batch.unitCost)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-muted-foreground tabular-nums">
                        {batch.quantity}
                      </td>
                      <td
                        className={cn(
                          'px-4 py-3 text-right font-mono font-bold tabular-nums',
                          depleted ? 'text-muted-foreground/40' : 'text-foreground',
                        )}
                      >
                        {batch.remainingQty}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
