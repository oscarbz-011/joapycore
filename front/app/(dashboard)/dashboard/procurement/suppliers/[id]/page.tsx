'use client';

import { usePermission } from '@/lib/permissions';

import { RequirePermission } from '@/components/require-permission';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, FileSpreadsheet, Link2, Pencil, Search,
  Trash2, TriangleAlert, Unlink, Upload, X,
} from 'lucide-react';
import { NumericInput } from '../../../../../../components/numeric-input';
import {
  procurementApi,
  type CatalogImportResult,
  type SupplierCatalogItem,
} from '../../../../../../lib/api/procurement';
import { CatalogMapDialog } from '@/components/procurement/catalog-map-dialog';
import { SupplierDialog } from '@/components/procurement/supplier-dialog';
import { SupplierSummary } from '@/components/procurement/supplier-summary';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

// ── Helpers ────────────────────────────────────────────────────────────────────

const NUM_CLS = 'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}

type MapFilter = 'all' | 'unmapped';

// ── Editar un ítem del catálogo ────────────────────────────────────────────────

function EditItemDialog({
  item,
  onClose,
}: {
  item: SupplierCatalogItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState(item.description);
  const [price, setPrice] = useState(item.price ?? 0);
  const [unit, setUnit] = useState(item.supplierUnit ?? '');
  const [factor, setFactor] = useState(item.conversionFactor ?? 0);
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => {
      // Solo se mandan los campos realmente editados: la API no tiene forma de
      // limpiar un campo, así que enviar todo convertiría un precio nulo en 0.
      const dto: {
        description?: string; price?: number; supplierUnit?: string; conversionFactor?: number;
      } = {};
      if (description.trim() !== item.description) dto.description = description.trim();
      if (price !== (item.price ?? 0)) dto.price = price;
      if (unit.trim() !== (item.supplierUnit ?? '')) dto.supplierUnit = unit.trim();
      if (factor !== (item.conversionFactor ?? 0)) dto.conversionFactor = factor;
      return procurementApi.updateCatalogItem(item.id, dto);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-catalog'] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo guardar el ítem')),
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="flex flex-col gap-0 sm:max-w-md p-0 overflow-hidden">
        <DialogHeader className="flex-row items-center justify-between border-b border-border px-5 py-4">
          <DialogTitle>Editar ítem</DialogTitle>
          <Button variant="ghost" size="icon-sm" onClick={onClose}>
            <X size={16} />
          </Button>
        </DialogHeader>

        <form
          onSubmit={(e) => { e.preventDefault(); setError(''); mutation.mutate(); }}
          className="px-5 py-4 space-y-3"
        >
          <div className="space-y-1.5">
            <Label>Código del proveedor</Label>
            <Input value={item.supplierSku} disabled className="font-mono" />
          </div>

          <div className="space-y-1.5">
            <Label>Descripción</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Precio</Label>
            <NumericInput className={NUM_CLS} value={price} onChange={setPrice} placeholder="0" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Unidad del proveedor</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="CAJA" />
            </div>
            <div className="space-y-1.5">
              <Label>Factor de conversión</Label>
              <NumericInput className={NUM_CLS} value={factor} decimals={4} onChange={setFactor} placeholder="1" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground/60">
            El factor dice cuántas unidades internas entran en una unidad del proveedor
            (una caja de 12 = factor 12).
          </p>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" className="flex-1" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Borrar un ítem ─────────────────────────────────────────────────────────────

function DeleteItemDialog({
  item,
  onClose,
}: {
  item: SupplierCatalogItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => procurementApi.removeCatalogItem(item.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['supplier-catalog'] });
      onClose();
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo eliminar el ítem')),
  });

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent showCloseButton={false} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar del catálogo</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Se va a quitar <span className="font-medium text-foreground">{item.supplierSku}</span> — {item.description}.
          No afecta al producto interno, solo a la lista de precios de este proveedor.
        </p>
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
          <Button
            variant="destructive"
            className="flex-1"
            disabled={mutation.isPending}
            onClick={() => { setError(''); mutation.mutate(); }}
          >
            {mutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Resultado de la importación ────────────────────────────────────────────────

// Se muestra fijo en la pantalla y no como un toast: el usuario necesita tener
// a la vista el número de fila y el motivo para poder corregir el archivo.
function ImportReport({
  fileName,
  result,
  onDismiss,
}: {
  fileName: string;
  result: CatalogImportResult;
  onDismiss: () => void;
}) {
  const rejected = result.errors.length;
  const allFailed = result.imported === 0;

  return (
    <div
      className={cn(
        'mb-4 overflow-hidden rounded-xl border',
        allFailed ? 'border-destructive/30 bg-destructive/5'
          : rejected > 0 ? 'border-warn/30 bg-warn-subtle'
          : 'border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30',
      )}
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <FileSpreadsheet
          size={18}
          className={cn(
            'mt-0.5 shrink-0',
            allFailed ? 'text-destructive' : rejected > 0 ? 'text-warn' : 'text-emerald-600 dark:text-emerald-400',
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground">
            {result.imported} de {result.totalRows} filas importadas
            {rejected > 0 && ` · ${rejected} rechazada${rejected === 1 ? '' : 's'}`}
          </p>
          <p className="text-xs text-muted-foreground/70 truncate">{fileName}</p>
          {rejected === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              El archivo entró completo. Revisá los ítems sin mapear para poder usarlos en una orden de compra.
            </p>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" onClick={onDismiss}>
          <X size={15} />
        </Button>
      </div>

      {rejected > 0 && (
        <div className="border-t border-border/60">
          <p className="px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
            Filas rechazadas — corregilas en el archivo y volvé a importar
          </p>
          <div className="max-h-64 overflow-y-auto px-4 pb-3">
            <ul className="space-y-1">
              {result.errors.map((e) => (
                <li key={`${e.row}-${e.message}`} className="flex gap-3 text-sm">
                  <span className="w-16 shrink-0 font-mono tabular-nums text-muted-foreground">
                    Fila {e.row}
                  </span>
                  <span className="min-w-0 text-foreground">{e.message}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Estado vacío ───────────────────────────────────────────────────────────────

function EmptyCatalog({ onImport }: { onImport: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-6 py-10 text-center">
      <FileSpreadsheet size={26} className="mx-auto mb-3 text-muted-foreground/50" />
      <p className="text-sm font-medium text-foreground">Este proveedor todavía no tiene lista de precios</p>
      <p className="mx-auto mt-1.5 max-w-lg text-sm text-muted-foreground">
        Subí el <span className="font-medium text-foreground">.xlsx</span> o{' '}
        <span className="font-medium text-foreground">.csv</span> tal como lo manda el proveedor.
        No hace falta crear los productos primero: los ítems entran sin vincular y después los mapeás.
      </p>

      <div className="mx-auto mt-5 max-w-lg rounded-xl border border-border bg-muted/20 px-4 py-3 text-left">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground/60">
          Columnas que reconoce
        </p>
        <ul className="space-y-1.5 text-sm">
          <li className="flex gap-2">
            <Badge variant="outline" className="shrink-0">Código *</Badge>
            <span className="text-muted-foreground">también <em>cod</em>, <em>sku</em>, <em>referencia</em></span>
          </li>
          <li className="flex gap-2">
            <Badge variant="outline" className="shrink-0">Descripción *</Badge>
            <span className="text-muted-foreground">también <em>detalle</em>, <em>producto</em>, <em>artículo</em></span>
          </li>
          <li className="flex gap-2">
            <Badge variant="outline" className="shrink-0">Precio</Badge>
            <span className="text-muted-foreground">opcional — acepta 1.250.000 o Gs. 350</span>
          </li>
          <li className="flex gap-2">
            <Badge variant="outline" className="shrink-0">Unidad</Badge>
            <span className="text-muted-foreground">opcional — la unidad del proveedor (CAJA, UN)</span>
          </li>
          <li className="flex gap-2">
            <Badge variant="outline" className="shrink-0">Factor</Badge>
            <span className="text-muted-foreground">opcional — unidades internas por unidad del proveedor</span>
          </li>
        </ul>
        <p className="mt-3 text-xs text-muted-foreground/60">
          Las filas con problemas no frenan la importación: entran las buenas y te devolvemos
          el número de fila y el motivo de cada una que quedó afuera.
        </p>
      </div>

      <RequirePermission permission="procurement:create">
        <Button className="mt-5" onClick={onImport}>
          <Upload size={15} />
          Importar lista de precios
        </Button>
      </RequirePermission>
    </div>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────────

export default function SupplierDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const supplierId = params.id;

  const fileRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [mapFilter, setMapFilter] = useState<MapFilter>('all');
  const [importReport, setImportReport] = useState<{ fileName: string; result: CatalogImportResult } | null>(null);
  const [importError, setImportError] = useState('');
  const [mapTarget, setMapTarget] = useState<SupplierCatalogItem | null>(null);
  const [editTarget, setEditTarget] = useState<SupplierCatalogItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SupplierCatalogItem | null>(null);
  const canImport = usePermission('procurement:create');
  const canEditCatalog = usePermission('procurement:update');
  const canEditSupplier = usePermission('suppliers:update');
  const [editingSupplier, setEditingSupplier] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: supplier, isLoading: loadingSupplier } = useQuery({
    queryKey: ['supplier', supplierId],
    queryFn: () => procurementApi.getSupplier(supplierId),
  });

  const filters = {
    search: debouncedSearch || undefined,
    unmapped: mapFilter === 'unmapped' ? true : undefined,
  };

  const { data: items = [], isLoading: loadingCatalog } = useQuery({
    queryKey: ['supplier-catalog', supplierId, debouncedSearch, mapFilter],
    queryFn: () => procurementApi.listCatalog(supplierId, filters),
  });

  const importMutation = useMutation({
    mutationFn: (file: File) => procurementApi.importCatalog(supplierId, file),
    onSuccess: (result, file) => {
      setImportReport({ fileName: file.name, result });
      void queryClient.invalidateQueries({ queryKey: ['supplier-catalog'] });
    },
    onError: (err) => setImportError(apiErrorMessage(err, 'No se pudo importar el archivo')),
  });

  const unmapMutation = useMutation({
    mutationFn: (id: string) => procurementApi.mapCatalogItem(id, null),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['supplier-catalog'] }),
  });

  const hasFilters = debouncedSearch !== '' || mapFilter === 'unmapped';
  const unmappedCount = items.filter((i) => i.productId === null).length;
  // El estado vacío ya trae su propio botón de importar; en el resto de los
  // casos el botón vive en el encabezado.
  const showEmptyState = !loadingCatalog && items.length === 0 && !hasFilters;

  function pickFile() {
    setImportError('');
    fileRef.current?.click();
  }

  if (loadingSupplier) {
    return <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando proveedor...</div>;
  }

  if (!supplier) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground/60">No se encontró el proveedor.</p>
        <Button variant="outline" className="mt-3" onClick={() => router.push('/dashboard/procurement/suppliers')}>
          Volver a proveedores
        </Button>
      </div>
    );
  }

  return (
    <div>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.csv"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importMutation.mutate(f);
          e.target.value = '';
        }}
      />

      <button
        onClick={() => router.push('/dashboard/procurement/suppliers')}
        className="mb-5 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        Volver a proveedores
      </button>

      <div className="mb-6">
        <SupplierSummary
          supplier={supplier}
          actions={
            <>
              <Button variant="outline" onClick={() => setEditingSupplier(true)}>
                <Pencil size={15} />
                {canEditSupplier ? 'Editar datos' : 'Ver datos'}
              </Button>
              {canImport && !showEmptyState && (
                <Button onClick={pickFile} disabled={importMutation.isPending}>
                  <Upload size={15} />
                  {importMutation.isPending ? 'Importando...' : 'Importar lista'}
                </Button>
              )}
            </>
          }
        />
      </div>

      {editingSupplier && (
        <SupplierDialog
          supplier={supplier}
          onClose={() => setEditingSupplier(false)}
          onDeleted={() => router.push('/dashboard/procurement/suppliers')}
        />
      )}

      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Catálogo del proveedor</h2>
        {!loadingCatalog && items.length > 0 && (
          <p className="text-xs text-muted-foreground/70">
            {items.length} ítem{items.length === 1 ? '' : 's'}
            {mapFilter !== 'unmapped' && unmappedCount > 0 && (
              <> · <span className="text-warn font-medium">{unmappedCount} sin mapear</span></>
            )}
          </p>
        )}
      </div>

      {importError && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3">
          <TriangleAlert size={16} className="mt-0.5 shrink-0 text-destructive" />
          <p className="flex-1 text-sm text-destructive">{importError}</p>
          <Button variant="ghost" size="icon-sm" onClick={() => setImportError('')}>
            <X size={15} />
          </Button>
        </div>
      )}

      {importReport && (
        <ImportReport
          fileName={importReport.fileName}
          result={importReport.result}
          onDismiss={() => setImportReport(null)}
        />
      )}

      {loadingCatalog ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">Cargando catálogo...</div>
      ) : showEmptyState ? (
        <EmptyCatalog onImport={pickFile} />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-56 flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                className="pl-8"
                placeholder="Buscar por código o descripción..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={mapFilter || null}
              onValueChange={(v) => setMapFilter((v as MapFilter | null) ?? 'all')}
            >
              <SelectTrigger className="w-48 overflow-hidden">
                <span className="min-w-0 flex-1 truncate text-left text-sm">
                  {mapFilter === 'unmapped' ? 'Solo sin mapear' : 'Todos los ítems'}
                </span>
              </SelectTrigger>
              <SelectContent className="w-auto min-w-[12rem]">
                <SelectItem value="all">Todos los ítems</SelectItem>
                <SelectItem value="unmapped">Solo sin mapear</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {items.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm text-muted-foreground/60">
                {mapFilter === 'unmapped' && !debouncedSearch
                  ? 'No quedan ítems sin mapear. El catálogo entero está listo para usarse en órdenes de compra.'
                  : 'Ningún ítem coincide con la búsqueda.'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => { setSearch(''); setMapFilter('all'); }}
              >
                Limpiar filtros
              </Button>
            </div>
          ) : (
            <Card className="overflow-hidden p-0">
              {/* Alto acotado + encabezado sticky: el catálogo de un proveedor
                  puede traer cientos de filas y la referencia de columna se
                  pierde al scrollear. */}
              <div className="max-h-[calc(100vh-24rem)] overflow-auto">
                <table className="w-full text-[13.5px]">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3 text-left whitespace-nowrap">Código</th>
                      <th className="px-3 py-3 text-left">Descripción</th>
                      <th className="px-3 py-3 text-right whitespace-nowrap">Precio</th>
                      <th className="px-3 py-3 text-left whitespace-nowrap">Unidad</th>
                      <th className="px-3 py-3 text-left">Producto interno</th>
                      <th className="px-3 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {items.map((item) => {
                      const mapped = item.productId !== null;
                      return (
                        <tr key={item.id} className={cn('hover:bg-muted/20 transition-colors', !mapped && 'bg-warn-subtle/40')}>
                          <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground whitespace-nowrap">
                            {item.supplierSku}
                          </td>
                          <td className="px-3 py-2.5 text-foreground">{item.description}</td>
                          <td className="px-3 py-2.5 text-right font-mono tabular-nums whitespace-nowrap">
                            {item.price !== null
                              ? fmtGs(item.price)
                              : <span className="text-muted-foreground/50">Sin precio</span>}
                          </td>
                          <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                            {item.supplierUnit ?? '—'}
                            {item.conversionFactor ? ` ×${item.conversionFactor}` : ''}
                          </td>
                          <td className="px-3 py-2.5">
                            {mapped ? (
                              <span className="text-foreground">{item.product?.name ?? 'Producto vinculado'}</span>
                            ) : (
                              <Badge variant="outline" className="border-warn/40 bg-warn-subtle text-warn">
                                Sin mapear
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2.5">
                            {canEditCatalog && (
                            <div className="flex items-center justify-end gap-1">
                              {mapped ? (
                                <Button
                                  variant="ghost"
                                  size="xs"
                                  disabled={unmapMutation.isPending}
                                  onClick={() => unmapMutation.mutate(item.id)}
                                  title="Desvincular del producto interno"
                                >
                                  <Unlink size={13} />
                                  Desvincular
                                </Button>
                              ) : (
                                <Button variant="outline" size="xs" onClick={() => setMapTarget(item)}>
                                  <Link2 size={13} />
                                  Vincular
                                </Button>
                              )}
                              <Button variant="ghost" size="icon-xs" title="Editar" onClick={() => setEditTarget(item)}>
                                <Pencil size={13} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon-xs"
                                title="Eliminar"
                                className="text-destructive"
                                onClick={() => setDeleteTarget(item)}
                              >
                                <Trash2 size={13} />
                              </Button>
                            </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {mapTarget && <CatalogMapDialog item={mapTarget} onClose={() => setMapTarget(null)} />}
      {editTarget && <EditItemDialog item={editTarget} onClose={() => setEditTarget(null)} />}
      {deleteTarget && <DeleteItemDialog item={deleteTarget} onClose={() => setDeleteTarget(null)} />}
    </div>
  );
}
