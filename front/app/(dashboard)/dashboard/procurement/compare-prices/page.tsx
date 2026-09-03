'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Star } from 'lucide-react';
import { inventoryApi, type Product, type ProductSupplier } from '../../../../../lib/api/inventory';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-PY', { style: 'currency', currency: 'PYG', maximumFractionDigits: 0 }).format(n);
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function ComparePricesPage() {
  const [productId, setProductId] = useState('');

  const { data: products = [] } = useQuery({
    queryKey: ['inventory-products-active'],
    queryFn: () => inventoryApi.listProducts({ isActive: true }),
  });

  const { data: prices = [], isLoading } = useQuery({
    queryKey: ['product-suppliers', productId],
    queryFn: () => inventoryApi.getProductSuppliers(productId),
    enabled: !!productId,
  });

  const selectedProduct: Product | undefined = products.find((p) => p.id === productId);
  const sorted = [...prices]
    .filter((p): p is ProductSupplier & { costPrice: number } => p.costPrice != null)
    .sort((a, b) => a.costPrice - b.costPrice);
  const cheapestId = sorted[0]?.id;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Comparar precios</h1>
        <p className="mt-1 text-sm text-muted-foreground">Comparar precio de un producto entre proveedores</p>
      </div>

      <div className="mb-4 max-w-md space-y-1">
        <Select value={productId || 'none'} onValueChange={(v) => setProductId(v && v !== 'none' ? v : '')}>
          <SelectTrigger className="w-full">
            <span className="flex-1 text-left text-sm truncate">
              {selectedProduct ? `${selectedProduct.name}${selectedProduct.model ? ` (${selectedProduct.model})` : ''}` : '— Seleccionar producto —'}
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

      {!productId ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Elegí un producto para ver sus precios por proveedor.
        </div>
      ) : isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Cargando precios...</div>
      ) : sorted.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">Este producto todavía no tiene precios de proveedor cargados.</p>
          <Link
            href={`/dashboard/inventory/products/${productId}`}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-foreground underline underline-offset-2"
          >
            Cargar precios en la ficha del producto
            <ExternalLink size={12} />
          </Link>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Proveedor</th>
                  <th className="px-4 py-3 text-right">Costo</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((p) => (
                  <tr key={p.id} className={cn(p.id === cheapestId && 'bg-accent-subtle/40')}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {p.supplier.contactName && (
                          <span className="text-xs text-muted-foreground/60">{p.supplier.contactName}</span>
                        )}
                        <span className="font-medium text-foreground">{p.supplier.name}</span>
                      </div>
                      {p.supplier.email && <div className="text-xs text-muted-foreground/60">{p.supplier.email}</div>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-foreground tabular-nums">
                      {formatPrice(p.costPrice)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {p.id === cheapestId && (
                          <Badge variant="outline" className="bg-accent-subtle text-accent-on border-accent-on/20">
                            Más barato
                          </Badge>
                        )}
                        {p.isPreferred && (
                          <Badge variant="outline" className="gap-1 bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800">
                            <Star size={10} />
                            Principal
                          </Badge>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-3">
            <Link
              href={`/dashboard/inventory/products/${productId}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Gestionar precios de este producto
              <ExternalLink size={11} />
            </Link>
          </div>
        </Card>
      )}
    </div>
  );
}
