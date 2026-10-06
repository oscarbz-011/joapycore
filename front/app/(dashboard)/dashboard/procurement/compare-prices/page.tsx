'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Plus, Trash2, Trophy } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { inventoryApi } from '@/lib/api/inventory';
import { procurementApi } from '@/lib/api/procurement';
import { AVAILABILITY_LABEL } from '@/lib/commercial-terms';
import { formatDatePY, localISODate } from '@/lib/date';
import {
  bestQuoteId,
  compareSuppliers,
  type QuoteLine,
  type SupplierQuote,
} from '@/lib/supplier-comparison';
import { leadTimeLabel, paymentTermLabel } from '@/lib/suppliers';
import { cn } from '@/lib/utils';

const gs = (n: number) => 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
const plain = (n: number) =>
  new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 }).format(n);

interface NeedRow {
  key: number;
  productId: string;
  quantity: string;
}

let nextKey = 1;
const newRow = (): NeedRow => ({ key: nextKey++, productId: '', quantity: '1' });

const AVAILABILITY_CLASS = {
  AVAILABLE: 'text-foreground',
  ON_ORDER: 'text-warn',
  OUT_OF_STOCK: 'text-destructive',
} as const;

function LineCell({ line }: { line: QuoteLine | undefined }) {
  if (!line) return <span className="text-muted-foreground">No lo ofrece</span>;
  return (
    <div className="space-y-0.5">
      <p className="font-mono tabular-nums text-foreground">{gs(line.subtotal)}</p>
      <p className="text-xs text-muted-foreground">
        {plain(line.supplierQuantity)} {line.supplierUnit ?? 'u.'} × {gs(line.unitPrice)}
        {line.unitCost !== line.unitPrice && <> · {gs(line.unitCost)} por unidad</>}
      </p>
      {line.raisedToMinimum && (
        <p className="text-xs text-warn">Mínimo del proveedor: {plain(line.supplierQuantity)}</p>
      )}
      {line.priceExpired && <p className="text-xs text-destructive">Precio de lista vencido</p>}
      {line.availability && (
        <p className={cn('text-xs', AVAILABILITY_CLASS[line.availability])}>
          {AVAILABILITY_LABEL[line.availability]}
          {line.availabilityUpdatedAt && (
            <span className="text-muted-foreground">
              {' '}
              (al {formatDatePY(line.availabilityUpdatedAt, 'local')})
            </span>
          )}
        </p>
      )}
    </div>
  );
}

const UNKNOWN = <span className="text-muted-foreground">Sin dato</span>;

/** Las filas de la comparación que no dependen de un producto. */
const SUMMARY_ROWS: { label: string; strong?: boolean; cell: (q: SupplierQuote) => ReactNode }[] = [
  { label: 'Subtotal', cell: (q) => <span className="font-mono tabular-nums">{gs(q.subtotal)}</span> },
  {
    label: 'Descuento por volumen',
    cell: (q) =>
      q.discountAmount > 0 ? (
        <span className="font-mono tabular-nums text-foreground">
          − {gs(q.discountAmount)} ({plain(q.discountPercent)}%)
        </span>
      ) : (
        <span className="text-muted-foreground">No aplica</span>
      ),
  },
  {
    label: 'Envío',
    cell: (q) =>
      q.shippingCost === null ? (
        UNKNOWN
      ) : q.shippingCost === 0 ? (
        'Sin cargo'
      ) : (
        <span className="font-mono tabular-nums">{gs(q.shippingCost)}</span>
      ),
  },
  {
    label: 'Total',
    strong: true,
    cell: (q) => <span className="font-mono text-base font-bold tabular-nums">{gs(q.total)}</span>,
  },
  { label: 'Condición de pago', cell: (q) => paymentTermLabel(q.supplier.paymentTermDays) },
  {
    label: 'Plazo de entrega',
    cell: (q) => (q.supplier.leadTimeDays === null ? UNKNOWN : leadTimeLabel(q.supplier.leadTimeDays)),
  },
  {
    label: 'Pedido mínimo',
    cell: (q) =>
      q.supplier.minOrderAmount === null ? (
        UNKNOWN
      ) : q.meetsMinimum ? (
        <>{gs(q.supplier.minOrderAmount)} · se cumple</>
      ) : (
        <span className="text-destructive">
          {gs(q.supplier.minOrderAmount)} · faltan {gs(q.minimumShortfall)}
        </span>
      ),
  },
];

export default function CompareSuppliersPage() {
  const [rows, setRows] = useState<NeedRow[]>(() => [newRow()]);
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['inventory-products-active'],
    queryFn: () => inventoryApi.listProducts({ status: 'ACTIVE', isPurchasable: true }),
  });

  const needs = rows
    .map((row) => ({ productId: row.productId, quantity: Number(row.quantity) }))
    .filter((need) => need.productId && need.quantity > 0);
  const productIds = [...new Set(needs.map((need) => need.productId))].sort();

  const {
    data: offers = [],
    isLoading: loadingOffers,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['catalog-offers', productIds],
    queryFn: () => procurementApi.listOffers(productIds),
    enabled: productIds.length > 0,
  });

  const allQuotes = compareSuppliers(needs, offers, localISODate(new Date()));
  const quotes = allQuotes.filter((quote) => !excluded.has(quote.supplier.id));
  const bestId = quotes.length > 1 ? bestQuoteId(quotes) : null;
  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Producto';
  const chosen = new Set(rows.map((row) => row.productId).filter(Boolean));

  const patch = (key: number, change: Partial<NeedRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...change } : row)));

  function toggleSupplier(id: string, include: boolean) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (include) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Comparar proveedores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Precio, descuentos, envío, pago, entrega y mínimos de cada proveedor para lo que
          necesitás comprar: un solo producto o una lista.
        </p>
      </div>

      <Card className="mb-6 gap-3 p-5">
        <p className="text-sm font-semibold text-foreground">Qué necesitás comprar</p>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={row.key} className="grid grid-cols-[1fr_7rem_2rem] items-end gap-2">
              <div className="space-y-1.5">
                {index === 0 && <Label>Producto</Label>}
                <Select
                  value={row.productId || 'none'}
                  onValueChange={(v) => patch(row.key, { productId: v && v !== 'none' ? v : '' })}
                >
                  <SelectTrigger className="w-full" aria-label={`Producto ${index + 1}`}>
                    <span className="min-w-0 flex-1 truncate text-left text-sm">
                      {row.productId
                        ? productName(row.productId)
                        : loadingProducts
                          ? 'Cargando productos...'
                          : '— Seleccionar producto —'}
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Seleccionar producto —</SelectItem>
                    {products
                      .filter((p) => p.id === row.productId || !chosen.has(p.id))
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.model ? ` — ${p.model}` : ''}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                {index === 0 && <Label htmlFor={`need-qty-${row.key}`}>Cantidad</Label>}
                <Input
                  id={`need-qty-${row.key}`}
                  type="number"
                  min={1}
                  step={1}
                  aria-label={`Cantidad del producto ${index + 1}`}
                  value={row.quantity}
                  onChange={(e) => patch(row.key, { quantity: e.target.value })}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Quitar producto ${index + 1}`}
                disabled={rows.length === 1}
                onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
              >
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
        </div>
        <div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setRows((prev) => [...prev, newRow()])}>
            <Plus size={14} />
            Agregar producto
          </Button>
        </div>
      </Card>

      {productIds.length === 0 ? (
        <div className="py-14 text-center text-sm text-muted-foreground">
          Elegí al menos un producto y su cantidad para ver qué proveedores lo ofrecen.
        </div>
      ) : loadingOffers ? (
        <div className="py-14 text-center text-sm text-muted-foreground">Buscando ofertas...</div>
      ) : isError ? (
        <div className="py-14 text-center">
          <p className="text-sm text-destructive">No se pudieron cargar las ofertas.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : allQuotes.length === 0 ? (
        <div className="py-14 text-center">
          <p className="text-sm text-muted-foreground">
            Ningún proveedor tiene {productIds.length === 1 ? 'este producto' : 'estos productos'}{' '}
            en su catálogo con precio.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Se comparan los ítems de catálogo vinculados a un producto. Importá la lista del
            proveedor y vinculá sus ítems desde{' '}
            <Link href="/dashboard/procurement/suppliers" className="font-medium text-primary underline underline-offset-2">
              Proveedores
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <div className="mb-4">
            <p className="mb-2 text-sm font-semibold text-foreground">Proveedores a comparar</p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {allQuotes.map((quote) => (
                <Label key={quote.supplier.id} className="flex cursor-pointer items-center gap-2 font-normal">
                  <Checkbox
                    checked={!excluded.has(quote.supplier.id)}
                    onCheckedChange={(checked) => toggleSupplier(quote.supplier.id, checked === true)}
                  />
                  {quote.supplier.name}
                </Label>
              ))}
            </div>
            {quotes.length === 1 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {allQuotes.length === 1
                  ? 'Solo un proveedor ofrece lo que buscás: no hay con quién compararlo.'
                  : 'Marcá al menos dos proveedores para compararlos.'}
              </p>
            )}
          </div>

          {quotes.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Marcá al menos un proveedor.
            </div>
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[13.5px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30 text-left align-bottom">
                      <th className="w-48 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Concepto
                      </th>
                      {quotes.map((quote) => (
                        <th key={quote.supplier.id} className="min-w-52 px-4 py-3">
                          <Link
                            href={`/dashboard/procurement/suppliers/${quote.supplier.id}`}
                            className="text-sm font-semibold text-foreground hover:underline"
                          >
                            {quote.supplier.name}
                          </Link>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {quote.supplier.id === bestId && (
                              <Badge className="gap-1">
                                <Trophy size={11} aria-hidden />
                                Menor total
                              </Badge>
                            )}
                            {!quote.complete && <Badge variant="outline">No cotiza todo</Badge>}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border align-top">
                    {needs.map((need) => (
                      <tr key={need.productId}>
                        <th scope="row" className="px-4 py-3 text-left font-normal">
                          <p className="font-medium text-foreground">{productName(need.productId)}</p>
                          <p className="text-xs text-muted-foreground">{plain(need.quantity)} unidades</p>
                        </th>
                        {quotes.map((quote) => (
                          <td key={quote.supplier.id} className="px-4 py-3">
                            <LineCell line={quote.lines.find((l) => l.productId === need.productId)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                    {SUMMARY_ROWS.map((row) => (
                      <tr key={row.label} className={cn(row.strong && 'bg-muted/20')}>
                        <th
                          scope="row"
                          className={cn(
                            'px-4 py-3 text-left font-normal text-muted-foreground',
                            row.strong && 'font-semibold text-foreground',
                          )}
                        >
                          {row.label}
                        </th>
                        {quotes.map((quote) => (
                          <td key={quote.supplier.id} className="px-4 py-3 text-foreground">
                            {row.cell(quote)}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {quotes.some((quote) => quote.notes.length > 0) && (
                      <tr>
                        <th scope="row" className="px-4 py-3 text-left font-normal text-muted-foreground">
                          A tener en cuenta
                        </th>
                        {quotes.map((quote) => (
                          <td key={quote.supplier.id} className="px-4 py-3">
                            <ul className="space-y-1">
                              {quote.notes.map((note) => (
                                <li key={note} className="flex items-start gap-1.5 text-xs text-warn">
                                  <AlertTriangle size={12} aria-hidden className="mt-0.5 shrink-0" />
                                  {note}
                                </li>
                              ))}
                            </ul>
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          <p className="mt-3 text-xs text-muted-foreground">
            &ldquo;Menor total&rdquo; compara solo el precio final entre los proveedores que cotizan
            todo y llegan a su pedido mínimo. Pago, entrega y disponibilidad quedan a tu criterio.
          </p>
        </>
      )}
    </div>
  );
}
