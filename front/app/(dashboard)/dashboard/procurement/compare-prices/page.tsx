'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Link2, Plus, Trash2, Trophy } from 'lucide-react';
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
import { apiErrorMessage } from '@/lib/api/api-error';
import { inventoryApi } from '@/lib/api/inventory';
import { procurementApi, type LinkSuggestion } from '@/lib/api/procurement';
import { catalogUnitCost } from '@/lib/catalog-product';
import { AVAILABILITY_LABEL } from '@/lib/commercial-terms';
import { formatDatePY, localISODate } from '@/lib/date';
import { usePermission } from '@/lib/permissions';
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

const UNKNOWN = <span className="text-muted-foreground">Sin dato</span>;
const NOTHING = <span className="text-muted-foreground">—</span>;

function QuotedLine({ line }: { line: QuoteLine }) {
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

/**
 * El proveedor no cotiza el producto. Si en su catálogo hay ítems sin vincular
 * que se le parecen, se ofrecen para vincular ahí mismo: es el caso típico de
 * dos proveedores con el mismo producto donde solo uno quedó vinculado.
 */
function MissingLine({
  supplierId,
  productName,
  suggestions,
  canLink,
  linkingId,
  onLink,
}: {
  supplierId: string;
  productName: string;
  suggestions: LinkSuggestion[];
  canLink: boolean;
  linkingId: string | null;
  onLink: (suggestion: LinkSuggestion) => void;
}) {
  if (suggestions.length === 0) {
    return (
      <div className="space-y-1">
        <p className="text-muted-foreground">No lo tiene en su catálogo</p>
        <Link
          href={`/dashboard/procurement/suppliers/${supplierId}`}
          className="text-xs font-medium text-primary underline underline-offset-2"
        >
          Revisar su catálogo
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-warn">
        Sin vincular. ¿Alguno de estos ítems de su catálogo es {productName}?
      </p>
      <ul className="space-y-2">
        {suggestions.map((suggestion) => (
          <li key={suggestion.item.id} className="rounded-xl border border-border p-2">
            <p className="text-xs font-medium text-foreground">{suggestion.item.description}</p>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">{suggestion.item.supplierSku}</span>
              {suggestion.item.price !== null && <> · {gs(catalogUnitCost(suggestion.item))}</>}
            </p>
            {canLink && (
              <Button
                size="xs"
                variant="outline"
                className="mt-1.5"
                disabled={linkingId !== null}
                onClick={() => onLink(suggestion)}
              >
                <Link2 size={12} />
                {linkingId === suggestion.item.id ? 'Vinculando...' : 'Es este: vincular'}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

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
];

/** Condiciones del proveedor: valen aunque todavía no cotice nada. */
const TERMS_ROWS: { label: string; cell: (q: SupplierQuote) => ReactNode }[] = [
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
      ) : q.lines.length === 0 ? (
        gs(q.supplier.minOrderAmount)
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
  const queryClient = useQueryClient();
  const canLink = usePermission('procurement:update');
  const [rows, setRows] = useState<NeedRow[]>(() => [newRow()]);
  // Lo que el usuario marcó o desmarcó a mano. Sin entrada, un proveedor se
  // muestra si tiene algo que ver con lo pedido (lo cotiza o tiene un ítem
  // parecido sin vincular).
  const [picked, setPicked] = useState<Record<string, boolean>>({});
  const [linkError, setLinkError] = useState('');

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['inventory-products-active'],
    queryFn: () => inventoryApi.listProducts({ status: 'ACTIVE', isPurchasable: true }),
  });
  const { data: allSuppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: procurementApi.listSuppliers,
  });
  const suppliers = allSuppliers.filter((supplier) => supplier.isActive);

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
  const { data: suggestions = [] } = useQuery({
    queryKey: ['catalog-link-suggestions', productIds],
    queryFn: () => procurementApi.listLinkSuggestions(productIds),
    enabled: productIds.length > 0,
  });

  const linkMutation = useMutation({
    mutationFn: (suggestion: LinkSuggestion) =>
      procurementApi.mapCatalogItem(suggestion.item.id, suggestion.productId),
    onSuccess: () => {
      setLinkError('');
      void queryClient.invalidateQueries({ queryKey: ['catalog-offers'] });
      void queryClient.invalidateQueries({ queryKey: ['catalog-link-suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['supplier-catalog'] });
    },
    onError: (err) => setLinkError(apiErrorMessage(err, 'No se pudo vincular el ítem')),
  });

  const quoting = new Set(offers.map((offer) => offer.supplier.id));
  const suggested = new Set(suggestions.map((s) => s.item.supplier.id));
  const isShown = (id: string) => picked[id] ?? (quoting.has(id) || suggested.has(id));

  const shownSuppliers = suppliers.filter((supplier) => isShown(supplier.id));
  const quotes = compareSuppliers(needs, offers, localISODate(new Date()), shownSuppliers).filter(
    (quote) => isShown(quote.supplier.id),
  );
  const quotingCount = quotes.filter((quote) => quote.lines.length > 0).length;
  const bestId = quotingCount > 1 ? bestQuoteId(quotes) : null;

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Producto';
  const chosen = new Set(rows.map((row) => row.productId).filter(Boolean));
  const suggestionsFor = (supplierId: string, productId: string) =>
    suggestions.filter((s) => s.item.supplier.id === supplierId && s.productId === productId);

  const patch = (key: number, change: Partial<NeedRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...change } : row)));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Comparar proveedores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Precio, descuentos, envío, pago, entrega y mínimos de cada proveedor para lo que
          necesitás comprar: un solo producto o una lista.
        </p>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="gap-3 p-5">
          <p className="text-sm font-semibold text-foreground">1. Qué necesitás comprar</p>
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

        <Card className="gap-3 p-5">
          <div>
            <p className="text-sm font-semibold text-foreground">2. Proveedores a comparar</p>
            <p className="text-xs text-muted-foreground">
              Se marcan solos los que tienen lo que buscás. Podés sumar o quitar cualquiera.
            </p>
          </div>
          {suppliers.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay proveedores activos.</p>
          ) : (
            <ul className="max-h-56 space-y-2 overflow-y-auto">
              {suppliers.map((supplier) => {
                const hint =
                  productIds.length === 0
                    ? null
                    : quoting.has(supplier.id)
                      ? null
                      : suggested.has(supplier.id)
                        ? 'ítem parecido sin vincular'
                        : 'no lo tiene';
                return (
                  <li key={supplier.id}>
                    <Label className="flex cursor-pointer items-center gap-2 font-normal">
                      <Checkbox
                        checked={isShown(supplier.id)}
                        onCheckedChange={(checked) =>
                          setPicked((prev) => ({ ...prev, [supplier.id]: checked === true }))
                        }
                      />
                      <span className="min-w-0 truncate">{supplier.name}</span>
                      {hint && (
                        <span
                          className={cn(
                            'shrink-0 text-xs',
                            hint === 'no lo tiene' ? 'text-muted-foreground' : 'text-warn',
                          )}
                        >
                          · {hint}
                        </span>
                      )}
                    </Label>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {linkError && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {linkError}
        </p>
      )}

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
      ) : quotes.length === 0 ? (
        <div className="py-14 text-center">
          <p className="text-sm text-muted-foreground">
            Ningún proveedor tiene {productIds.length === 1 ? 'este producto' : 'estos productos'}{' '}
            vinculado en su catálogo.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Marcá un proveedor para ver su columna, o vinculá los ítems de su lista desde{' '}
            <Link href="/dashboard/procurement/suppliers" className="font-medium text-primary underline underline-offset-2">
              Proveedores
            </Link>
            .
          </p>
        </div>
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-[13.5px]">
                <thead>
                  <tr className="border-b border-border bg-muted/30 text-left align-bottom">
                    <th className="w-48 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      Concepto
                    </th>
                    {quotes.map((quote) => (
                      <th key={quote.supplier.id} className="min-w-56 px-4 py-3">
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
                          {quote.lines.length === 0 ? (
                            <Badge variant="outline">Sin cotización</Badge>
                          ) : (
                            !quote.complete && <Badge variant="outline">No cotiza todo</Badge>
                          )}
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
                        <p className="text-xs text-muted-foreground">
                          {plain(need.quantity)} {need.quantity === 1 ? 'unidad' : 'unidades'}
                        </p>
                      </th>
                      {quotes.map((quote) => {
                        const line = quote.lines.find((l) => l.productId === need.productId);
                        return (
                          <td key={quote.supplier.id} className="px-4 py-3">
                            {line ? (
                              <QuotedLine line={line} />
                            ) : (
                              <MissingLine
                                supplierId={quote.supplier.id}
                                productName={productName(need.productId)}
                                suggestions={suggestionsFor(quote.supplier.id, need.productId)}
                                canLink={canLink}
                                linkingId={
                                  linkMutation.isPending ? linkMutation.variables.item.id : null
                                }
                                onLink={(suggestion) => linkMutation.mutate(suggestion)}
                              />
                            )}
                          </td>
                        );
                      })}
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
                          {quote.lines.length === 0 ? NOTHING : row.cell(quote)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {TERMS_ROWS.map((row) => (
                    <tr key={row.label}>
                      <th scope="row" className="px-4 py-3 text-left font-normal text-muted-foreground">
                        {row.label}
                      </th>
                      {quotes.map((quote) => (
                        <td key={quote.supplier.id} className="px-4 py-3 text-foreground">
                          {row.cell(quote)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {quotes.some((quote) => quote.lines.length > 0 && quote.notes.length > 0) && (
                    <tr>
                      <th scope="row" className="px-4 py-3 text-left font-normal text-muted-foreground">
                        A tener en cuenta
                      </th>
                      {quotes.map((quote) => (
                        <td key={quote.supplier.id} className="px-4 py-3">
                          {quote.lines.length > 0 && (
                            <ul className="space-y-1">
                              {quote.notes.map((note) => (
                                <li key={note} className="flex items-start gap-1.5 text-xs text-warn">
                                  <AlertTriangle size={12} aria-hidden className="mt-0.5 shrink-0" />
                                  {note}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      ))}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="mt-3 text-xs text-muted-foreground">
            {quotingCount < 2
              ? 'Para comparar hacen falta al menos dos proveedores con el producto vinculado en su catálogo. '
              : '“Menor total” compara solo el precio final entre los proveedores que cotizan todo y llegan a su pedido mínimo. '}
            Pago, entrega y disponibilidad quedan a tu criterio.
          </p>
        </>
      )}
    </div>
  );
}
