'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Link2, Plus, ShoppingCart, Trash2, Trophy } from 'lucide-react';
import { CompareOrderDialog } from '@/components/procurement/compare-order-dialog';
import { RequirePermission } from '@/components/require-permission';
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
import {
  procurementApi,
  type CatalogOffer,
  type CatalogSearchResult,
  type LinkSuggestion,
} from '@/lib/api/procurement';
import { defaultPicks } from '@/lib/catalog-match';
import { catalogUnitCost } from '@/lib/catalog-product';
import { AVAILABILITY_LABEL } from '@/lib/commercial-terms';
import { formatDatePY, localISODate } from '@/lib/date';
import { usePermission } from '@/lib/permissions';
import {
  bestQuoteId,
  compareSuppliers,
  priceGapLabel,
  priceGaps,
  type Need,
  type PriceGap,
  type QuoteLine,
  type SupplierQuote,
} from '@/lib/supplier-comparison';
import { leadTimeLabel, paymentTermLabel } from '@/lib/suppliers';
import { cn } from '@/lib/utils';

const gs = (n: number) => 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
const plain = (n: number) =>
  new Intl.NumberFormat('es-PY', { maximumFractionDigits: 2 }).format(n);

const MIN_QUERY = 2;
// La búsqueda admite hasta 20 proveedores por consulta.
const MAX_SEARCH_SUPPLIERS = 20;
const NONE = 'none';

type RowMode = 'product' | 'search';

/**
 * Una fila de lo que se quiere comprar. `product`: un producto del inventario.
 * `search`: algo que todavía no existe como producto y se busca por texto o
 * código en los catálogos, para comparar listas recién cargadas.
 */
interface NeedRow {
  key: number;
  mode: RowMode;
  productId: string;
  query: string;
  quantity: string;
  /** Ítem elegido a mano por proveedor (o NONE); sin entrada, el más parecido. */
  picks: Record<string, string>;
}

let nextKey = 1;
const newRow = (mode: RowMode): NeedRow => ({
  key: nextKey++,
  mode,
  productId: '',
  query: '',
  quantity: '1',
  picks: {},
});
const rowId = (row: NeedRow) => (row.mode === 'product' ? row.productId : `search:${row.key}`);

/** El valor, con unos milisegundos de retraso: no busca en cada tecla. */
function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

const AVAILABILITY_CLASS = {
  AVAILABLE: 'text-foreground',
  ON_ORDER: 'text-warn',
  OUT_OF_STOCK: 'text-destructive',
} as const;

const UNKNOWN = <span className="text-muted-foreground">Sin dato</span>;
const NOTHING = <span className="text-muted-foreground">—</span>;

const GAP_CLASS = {
  cheaper: 'text-emerald-600 dark:text-emerald-400',
  highest: 'text-destructive',
  same: 'text-muted-foreground',
} as const;

/** "10% más barato" frente al proveedor más caro, o "El más caro". */
function Gap({ gap }: { gap: PriceGap | null | undefined }) {
  if (!gap) return null;
  return <p className={cn('text-xs font-medium', GAP_CLASS[gap.kind])}>{priceGapLabel(gap)}</p>;
}

function QuotedLine({ line, gap }: { line: QuoteLine; gap?: PriceGap | null }) {
  return (
    <div className="space-y-0.5">
      <p className="font-mono tabular-nums text-foreground">{gs(line.subtotal)}</p>
      <Gap gap={gap} />
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
 * que se le parecen, se ofrecen para vincular ahí mismo.
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

/**
 * Celda de una fila de búsqueda: el ítem del catálogo de ese proveedor que se
 * está comparando, con la posibilidad de elegir otro de los encontrados.
 */
function SearchCell({
  results,
  pickedId,
  line,
  gap,
  onPick,
}: {
  results: CatalogSearchResult[];
  pickedId: string | null;
  line: QuoteLine | undefined;
  gap: PriceGap | null;
  onPick: (itemId: string) => void;
}) {
  if (results.length === 0) {
    return <p className="text-muted-foreground">Sin resultados en su catálogo</p>;
  }
  const picked = results.find((item) => item.id === pickedId);
  return (
    <div className="space-y-2">
      {picked ? (
        <div>
          <p className="text-xs font-medium text-foreground">{picked.description}</p>
          <p className="text-xs text-muted-foreground">
            <span className="font-mono">{picked.supplierSku}</span>
            {picked.barcode && <> · cód. barras {picked.barcode}</>}
            {' · '}
            {picked.product ? `producto: ${picked.product.name}` : 'sin producto todavía'}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Ninguno elegido</p>
      )}
      {picked &&
        (line ? (
          <QuotedLine line={line} gap={gap} />
        ) : (
          <p className="text-xs text-warn">Sin precio en su lista</p>
        ))}
      <Select value={pickedId ?? NONE} onValueChange={(value) => onPick(value ?? NONE)}>
        <SelectTrigger className="h-8 w-full" aria-label="Ítem a comparar de este proveedor">
          <span className="min-w-0 flex-1 truncate text-left text-xs">
            {results.length === 1 ? 'Único resultado' : `Cambiar (${results.length} resultados)`}
          </span>
        </SelectTrigger>
        <SelectContent className="max-w-md">
          {results.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.description}
              {item.price !== null ? ` — ${gs(catalogUnitCost(item))}` : ' — sin precio'}
            </SelectItem>
          ))}
          <SelectItem value={NONE}>Ninguno de estos</SelectItem>
        </SelectContent>
      </Select>
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
  const [rows, setRows] = useState<NeedRow[]>(() => [newRow('search')]);
  // Lo que el usuario marcó o desmarcó a mano. Sin entrada, un proveedor se
  // muestra si tiene algo que ver con lo pedido.
  const [shownByHand, setShownByHand] = useState<Record<string, boolean>>({});
  const [linkError, setLinkError] = useState('');
  const [orderingFrom, setOrderingFrom] = useState<string | null>(null);

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['inventory-products-active'],
    queryFn: () => inventoryApi.listProducts({ status: 'ACTIVE', isPurchasable: true }),
  });
  const { data: allSuppliers = [] } = useQuery({
    queryKey: ['suppliers'],
    queryFn: procurementApi.listSuppliers,
  });
  const suppliers = allSuppliers.filter((supplier) => supplier.isActive);
  const searchSupplierIds = suppliers
    .slice(0, MAX_SEARCH_SUPPLIERS)
    .map((supplier) => supplier.id)
    .sort();

  // ── Filas por producto: ofertas vinculadas y sugerencias de vínculo ──
  const productIds = [
    ...new Set(rows.filter((row) => row.mode === 'product' && row.productId).map((row) => row.productId)),
  ].sort();
  const offersQuery = useQuery({
    queryKey: ['catalog-offers', productIds],
    queryFn: () => procurementApi.listOffers(productIds),
    enabled: productIds.length > 0,
  });
  const { data: suggestions = [] } = useQuery({
    queryKey: ['catalog-link-suggestions', productIds],
    queryFn: () => procurementApi.listLinkSuggestions(productIds),
    enabled: productIds.length > 0,
  });
  const productOffers = productIds.length > 0 ? (offersQuery.data ?? []) : [];

  // ── Filas de búsqueda: lo que encuentra cada catálogo, haya o no producto ──
  const searchRows = rows.filter((row) => row.mode === 'search');
  const typed = searchRows.map((row) => `${row.key}:${row.query.trim()}`).join('\u0000');
  const settled = useDebounced(typed);
  const queryOf = new Map(
    settled.split('\u0000').map((entry) => {
      const cut = entry.indexOf(':');
      return [Number(entry.slice(0, cut)), entry.slice(cut + 1)] as const;
    }),
  );
  const searches = useQueries({
    queries: searchRows.map((row) => {
      const query = queryOf.get(row.key) ?? '';
      return {
        queryKey: ['catalog-search', query, searchSupplierIds],
        queryFn: () => procurementApi.searchCatalog(query, searchSupplierIds),
        enabled: query.length >= MIN_QUERY && searchSupplierIds.length > 0,
      };
    }),
  });
  const resultsOf = new Map(
    searchRows.map((row, index) => {
      const query = queryOf.get(row.key) ?? '';
      return [row.key, query.length >= MIN_QUERY ? (searches[index]?.data ?? []) : []] as const;
    }),
  );
  const searching = searches.some((search) => search.isFetching) || typed !== settled;
  const searchFailed = searches.some((search) => search.isError);

  /** El ítem de ese proveedor que se compara en una fila de búsqueda. */
  // Sin elección a mano se compara el mismo producto en todas las listas, no
  // el primer resultado de cada una (ver defaultPicks).
  const defaultsOf = new Map(
    searchRows.map((row) => [row.key, defaultPicks(resultsOf.get(row.key) ?? [])] as const),
  );
  function pickedItem(row: NeedRow, supplierId: string): CatalogSearchResult | null {
    const found = (resultsOf.get(row.key) ?? []).filter((item) => item.supplierId === supplierId);
    const byHand = row.picks[supplierId];
    if (byHand === NONE) return null;
    const wanted = byHand ?? defaultsOf.get(row.key)?.[supplierId];
    return found.find((item) => item.id === wanted) ?? found[0] ?? null;
  }

  const searchOffers: CatalogOffer[] = searchRows.flatMap((row) =>
    suppliers.flatMap((supplier) => {
      const item = pickedItem(row, supplier.id);
      return item ? [{ ...item, supplier }] : [];
    }),
  );

  const needs: Need[] = rows.flatMap((row) => {
    const quantity = Number(row.quantity);
    if (!(quantity > 0)) return [];
    if (row.mode === 'product') {
      return row.productId ? [{ productId: row.productId, quantity }] : [];
    }
    const itemIds = suppliers.flatMap((supplier) => pickedItem(row, supplier.id)?.id ?? []);
    return [{ productId: rowId(row), quantity, itemIds }];
  });
  const hasInput = rows.some((row) =>
    row.mode === 'product' ? row.productId : (queryOf.get(row.key) ?? '').length >= MIN_QUERY,
  );

  // ── Proveedores a mostrar ──
  const related = new Set<string>([
    ...productOffers.map((offer) => offer.supplier.id),
    ...suggestions.map((suggestion) => suggestion.item.supplier.id),
    ...[...resultsOf.values()].flat().map((item) => item.supplierId),
  ]);
  const quoting = new Set<string>([
    ...productOffers.map((offer) => offer.supplier.id),
    ...searchOffers.map((offer) => offer.supplier.id),
  ]);
  const isShown = (id: string) => shownByHand[id] ?? related.has(id);
  const shownSuppliers = suppliers.filter((supplier) => isShown(supplier.id));

  const quotes = compareSuppliers(
    needs,
    [...productOffers, ...searchOffers],
    localISODate(new Date()),
    shownSuppliers,
  ).filter((quote) => isShown(quote.supplier.id));
  const quotingCount = quotes.filter((quote) => quote.lines.length > 0).length;
  const bestId = quotingCount > 1 ? bestQuoteId(quotes) : null;
  const orderingQuote = quotes.find((quote) => quote.supplier.id === orderingFrom);
  // El total solo se compara entre quienes cotizan todo: el de un proveedor
  // al que le falta un producto es más bajo porque compra menos.
  const totalGaps = priceGaps(
    quotes.map((quote) => (quote.complete && quote.lines.length > 0 ? quote.total : null)),
  );

  const linkMutation = useMutation({
    mutationFn: (suggestion: LinkSuggestion) =>
      procurementApi.mapCatalogItem(suggestion.item.id, suggestion.productId),
    onSuccess: () => {
      setLinkError('');
      for (const key of ['catalog-offers', 'catalog-link-suggestions', 'catalog-search', 'supplier-catalog']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (err) => setLinkError(apiErrorMessage(err, 'No se pudo vincular el ítem')),
  });

  const productName = (id: string) => products.find((p) => p.id === id)?.name ?? 'Producto';
  const chosen = new Set(rows.map((row) => row.productId).filter(Boolean));
  const suggestionsFor = (supplierId: string, productId: string) =>
    suggestions.filter((s) => s.item.supplier.id === supplierId && s.productId === productId);
  const patch = (key: number, change: Partial<NeedRow>) =>
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...change } : row)));

  // Las filas que efectivamente se comparan, en el orden en que se cargaron.
  const tableRows = rows.filter((row) => needs.some((need) => need.productId === rowId(row)));
  const loading = (productIds.length > 0 && offersQuery.isLoading) || (searching && quotes.length === 0);
  const failed = (productIds.length > 0 && offersQuery.isError) || searchFailed;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">Comparar proveedores</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Precio, descuentos, envío, pago, entrega y mínimos de cada proveedor. Sirve para
          reponer un producto y también para comparar listas recién cargadas, antes de crear
          ningún producto.
        </p>
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Card className="gap-3 p-5">
          <p className="text-sm font-semibold text-foreground">1. Qué necesitás comprar</p>
          <div className="space-y-2">
            {rows.map((row, index) => (
              <div key={row.key} className="grid grid-cols-[11rem_1fr_6rem_2rem] items-end gap-2">
                <div className="space-y-1.5">
                  {index === 0 && <Label>Buscar en</Label>}
                  <Select
                    value={row.mode}
                    onValueChange={(value) => patch(row.key, { mode: (value ?? 'search') as RowMode })}
                  >
                    <SelectTrigger className="w-full" aria-label={`Dónde buscar, fila ${index + 1}`}>
                      <span className="min-w-0 flex-1 truncate text-left text-sm">
                        {row.mode === 'search' ? 'Catálogos' : 'Mis productos'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="search">Catálogos de proveedores</SelectItem>
                      <SelectItem value="product">Mis productos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  {index === 0 && <Label>Qué buscás</Label>}
                  {row.mode === 'search' ? (
                    <Input
                      aria-label={`Qué buscás, fila ${index + 1}`}
                      placeholder="Descripción, código de barras o código del proveedor..."
                      value={row.query}
                      onChange={(e) => patch(row.key, { query: e.target.value, picks: {} })}
                    />
                  ) : (
                    <Select
                      value={row.productId || NONE}
                      onValueChange={(v) => patch(row.key, { productId: v && v !== NONE ? v : '' })}
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
                        <SelectItem value={NONE}>— Seleccionar producto —</SelectItem>
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
                  )}
                </div>
                <div className="space-y-1.5">
                  {index === 0 && <Label htmlFor={`need-qty-${row.key}`}>Cantidad</Label>}
                  <Input
                    id={`need-qty-${row.key}`}
                    type="number"
                    min={1}
                    step={1}
                    aria-label={`Cantidad, fila ${index + 1}`}
                    value={row.quantity}
                    onChange={(e) => patch(row.key, { quantity: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Quitar fila ${index + 1}`}
                  disabled={rows.length === 1}
                  onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                >
                  <Trash2 size={14} />
                </Button>
              </div>
            ))}
          </div>
          <div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRows((prev) => [...prev, newRow(prev[prev.length - 1]?.mode ?? 'search')])}
            >
              <Plus size={14} />
              Agregar otro
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
                const hint = !hasInput
                  ? null
                  : quoting.has(supplier.id)
                    ? null
                    : related.has(supplier.id)
                      ? 'tiene ítems parecidos'
                      : 'no lo tiene';
                return (
                  <li key={supplier.id}>
                    <Label className="flex cursor-pointer items-center gap-2 font-normal">
                      <Checkbox
                        checked={isShown(supplier.id)}
                        onCheckedChange={(checked) =>
                          setShownByHand((prev) => ({ ...prev, [supplier.id]: checked === true }))
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

      {!hasInput ? (
        <div className="py-14 text-center text-sm text-muted-foreground">
          Escribí lo que buscás, o elegí uno de tus productos, para ver qué proveedores lo ofrecen.
        </div>
      ) : loading ? (
        <div className="py-14 text-center text-sm text-muted-foreground">Buscando ofertas...</div>
      ) : failed ? (
        <div className="py-14 text-center">
          <p className="text-sm text-destructive">No se pudieron cargar las ofertas.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => {
              void offersQuery.refetch();
              void queryClient.invalidateQueries({ queryKey: ['catalog-search'] });
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : quotes.length === 0 || tableRows.length === 0 ? (
        <div className="py-14 text-center">
          <p className="text-sm text-muted-foreground">
            Ningún catálogo tiene algo que coincida con lo que buscás.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Probá con otras palabras o con el código de barras. Las listas se cargan desde{' '}
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
                      <th key={quote.supplier.id} className="min-w-60 px-4 py-3">
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
                  {tableRows.map((row) => {
                    const id = rowId(row);
                    const quantity = Number(row.quantity);
                    // Se compara el costo por unidad: un proveedor puede vender
                    // por caja y otro suelto, y el subtotal no sería parejo.
                    const gaps = priceGaps(
                      quotes.map(
                        (quote) => quote.lines.find((l) => l.productId === id)?.unitCost ?? null,
                      ),
                    );
                    return (
                      <tr key={row.key}>
                        <th scope="row" className="px-4 py-3 text-left font-normal">
                          <p className="font-medium text-foreground">
                            {row.mode === 'product' ? productName(row.productId) : `“${row.query.trim()}”`}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {plain(quantity)} {quantity === 1 ? 'unidad' : 'unidades'}
                            {row.mode === 'search' && ' · sin producto creado'}
                          </p>
                        </th>
                        {quotes.map((quote, column) => {
                          const supplierId = quote.supplier.id;
                          const line = quote.lines.find((l) => l.productId === id);
                          const gap = gaps[column];
                          return (
                            <td key={supplierId} className="px-4 py-3">
                              {row.mode === 'search' ? (
                                <SearchCell
                                  results={(resultsOf.get(row.key) ?? []).filter(
                                    (item) => item.supplierId === supplierId,
                                  )}
                                  pickedId={pickedItem(row, supplierId)?.id ?? null}
                                  line={line}
                                  gap={gap}
                                  onPick={(itemId) =>
                                    patch(row.key, { picks: { ...row.picks, [supplierId]: itemId } })
                                  }
                                />
                              ) : line ? (
                                <QuotedLine line={line} gap={gap} />
                              ) : (
                                <MissingLine
                                  supplierId={supplierId}
                                  productName={productName(row.productId)}
                                  suggestions={suggestionsFor(supplierId, row.productId)}
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
                    );
                  })}
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
                      {quotes.map((quote, column) => (
                        <td key={quote.supplier.id} className="px-4 py-3 text-foreground">
                          {quote.lines.length === 0 ? NOTHING : row.cell(quote)}
                          {row.strong && <Gap gap={totalGaps[column]} />}
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
                  <RequirePermission permission="procurement:create">
                    <tr>
                      <th scope="row" className="px-4 py-3 text-left font-normal text-muted-foreground">
                        Comprar
                      </th>
                      {quotes.map((quote) => (
                        <td key={quote.supplier.id} className="px-4 py-3">
                          {quote.lines.length > 0 && (
                            <Button size="sm" onClick={() => setOrderingFrom(quote.supplier.id)}>
                              <ShoppingCart size={14} />
                              Crear orden
                            </Button>
                          )}
                        </td>
                      ))}
                    </tr>
                  </RequirePermission>
                </tbody>
              </table>
            </div>
          </Card>

          <p className="mt-3 text-xs text-muted-foreground">
            {quotingCount < 2
              ? 'Para comparar hacen falta al menos dos proveedores con un ítem elegido. '
              : '“Menor total” compara solo el precio final entre los proveedores que cotizan todo y llegan a su pedido mínimo. Los porcentajes se miden contra el proveedor más caro. '}
            Pago, entrega y disponibilidad quedan a tu criterio.
          </p>
        </>
      )}

      {orderingQuote && (
        <CompareOrderDialog
          key={orderingQuote.supplier.id}
          quote={orderingQuote}
          quotes={quotes}
          onClose={() => setOrderingFrom(null)}
        />
      )}
    </div>
  );
}
