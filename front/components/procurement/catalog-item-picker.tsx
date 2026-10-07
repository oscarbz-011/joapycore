'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, Link2, Plus, Search } from 'lucide-react';
import { CatalogMapDialog } from '@/components/procurement/catalog-map-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { procurementApi, type SupplierCatalogItem } from '@/lib/api/procurement';
import { catalogUnitCost } from '@/lib/catalog-product';
import { priceValidity, validityLabel } from '@/lib/catalog-validity';
import { localISODate } from '@/lib/date';
import { usePermission } from '@/lib/permissions';
import { catalogChoices } from '@/lib/purchase-order-lines';
import { cn } from '@/lib/utils';

const MAX_SHOWN = 80;
const fmtGs = (n: number) => 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));

/**
 * Elige ítems del catálogo de un proveedor para una orden de compra. Un ítem
 * sin vincular no se puede pedir: se vincula (o se crea el producto) desde acá.
 */
export function CatalogItemPicker({
  supplierId,
  supplierName,
  orderedProductIds,
  onPick,
  onClose,
}: {
  supplierId: string;
  supplierName: string;
  /** Productos que ya están en la orden, vengan o no del catálogo. */
  orderedProductIds: ReadonlySet<string>;
  onPick: (item: SupplierCatalogItem) => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [mapTarget, setMapTarget] = useState<SupplierCatalogItem | null>(null);
  const canLink = usePermission('procurement:update');
  const today = localISODate(new Date());

  // Bajo la misma clave raíz que el catálogo del proveedor: al vincular un
  // ítem desde acá, el diálogo de vínculo la invalida y la lista se refresca.
  const { data: items = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['supplier-catalog', supplierId, 'order-picker'],
    queryFn: () => procurementApi.listCatalog(supplierId),
  });

  const choices = catalogChoices(items, search);
  const shown = choices.slice(0, MAX_SHOWN);

  return (
    <>
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Catálogo de {supplierName}</DialogTitle>
            <DialogDescription>
              Los ítems se agregan a la orden con el código y el precio del proveedor.
            </DialogDescription>
          </DialogHeader>

          <div className="relative">
            <Search
              size={14}
              aria-hidden
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
            />
            <Input
              className="pl-8"
              autoFocus
              aria-label="Buscar en el catálogo"
              placeholder="Buscar por código, descripción o producto..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="max-h-[50vh] overflow-y-auto rounded-xl border border-border">
            {isLoading ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                Cargando catálogo...
              </p>
            ) : isError ? (
              <div className="px-3 py-10 text-center">
                <p className="text-sm text-destructive">No se pudo cargar el catálogo.</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
                  Reintentar
                </Button>
              </div>
            ) : items.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                Este proveedor todavía no tiene una lista de precios importada. Podés cargarla
                desde Proveedores, o agregar productos sueltos a la orden.
              </p>
            ) : shown.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                Ningún ítem coincide con la búsqueda.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {shown.map((item) => {
                  const linked = item.productId !== null;
                  const added = item.productId !== null && orderedProductIds.has(item.productId);
                  const validity = priceValidity(item, today).status;
                  return (
                    <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">
                          {item.product?.name ?? item.description}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{item.supplierSku}</span>
                          {linked && <> · {item.description}</>}
                          {!linked && <> · sin vincular a un producto</>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm tabular-nums text-foreground">
                          {item.price === null ? 'Sin precio' : fmtGs(catalogUnitCost(item))}
                        </p>
                        {(validity === 'expired' ||
                          validity === 'expiring' ||
                          validity === 'upcoming') && (
                          <p
                            className={cn(
                              'text-xs',
                              validity === 'expired' ? 'text-destructive' : 'text-warn',
                            )}
                          >
                            {validityLabel(item, today)}
                          </p>
                        )}
                      </div>
                      <div className="w-28 shrink-0 text-right">
                        {added ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
                            <Check size={13} aria-hidden />
                            En la orden
                          </span>
                        ) : linked ? (
                          <Button size="sm" onClick={() => onPick(item)}>
                            <Plus size={14} />
                            Agregar
                          </Button>
                        ) : canLink ? (
                          <Button size="sm" variant="outline" onClick={() => setMapTarget(item)}>
                            <Link2 size={14} />
                            Vincular
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Sin vincular</span>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {choices.length > shown.length && (
            <p className="text-xs text-muted-foreground">
              Mostrando {shown.length} de {choices.length} ítems. Afiná la búsqueda para ver el
              resto.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Listo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {mapTarget && <CatalogMapDialog item={mapTarget} onClose={() => setMapTarget(null)} />}
    </>
  );
}
