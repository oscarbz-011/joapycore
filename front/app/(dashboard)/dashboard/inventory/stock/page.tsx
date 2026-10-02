'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Package,
  Search,
  SlidersHorizontal,
  TriangleAlert,
  Warehouse,
} from 'lucide-react';
import {
  inventoryApi,
  SALES_CHANNEL_LABEL,
  type StockResult,
} from '../../../../../lib/api/inventory';
import {
  needsRestock,
  stockColumns,
  stockLevel,
  stockQuantity,
} from '../../../../../lib/inventory-stock';
import { UNLOCATED_SOURCE } from '../../../../../lib/inventory-transfer';
import { usePermission } from '@/lib/permissions';
import { StockTransferDialog } from '@/components/inventory/stock-transfer-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const EMPTY_STOCK: StockResult = { warehouses: [], items: [] };

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}

const LEVEL_LABEL = { out: 'Sin stock', low: 'Stock bajo' } as const;
const LEVEL_TEXT = {
  out: 'text-destructive',
  low: 'text-warn',
  ok: 'text-foreground',
} as const;

interface TransferTarget {
  productId?: string;
  fromId?: string;
  quantity?: number;
}

export default function StockPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');
  const [onlyRestock, setOnlyRestock] = useState(false);
  const [transfer, setTransfer] = useState<TransferTarget | null>(null);
  const canMove = usePermission('inventory:movements:create');

  const { data: categories = [] } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: inventoryApi.listCategories,
  });
  const { data: brands = [] } = useQuery({
    queryKey: ['inventory-brands'],
    queryFn: inventoryApi.listBrands,
  });
  const { data = EMPTY_STOCK, isLoading, isError } = useQuery({
    queryKey: [
      'inventory-stock',
      search,
      categoryId,
      brandId,
      warehouseId,
    ],
    queryFn: () =>
      inventoryApi.getStock({
        search: search || undefined,
        categoryId: categoryId || undefined,
        brandId: brandId || undefined,
        warehouseId: warehouseId || undefined,
      }),
  });
  const columns = useMemo(
    () => stockColumns(data, warehouseId || null),
    [data, warehouseId],
  );
  const restockCount = useMemo(
    () => data.items.filter(needsRestock).length,
    [data],
  );
  const rows = onlyRestock ? data.items.filter(needsRestock) : data.items;

  return (
    <div>
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">
            Stock
          </h1>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Inventario físico disponible para la venta, total y por depósito
          </p>
        </div>
        {canMove && (
          <Button onClick={() => setTransfer({})}>
            <ArrowLeftRight size={15} />
            Trasladar entre depósitos
          </Button>
        )}
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="relative flex-1">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
          />
          <Input
            className="pl-8"
            placeholder="Buscar por nombre o modelo..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SlidersHorizontal
          size={15}
          className="shrink-0 text-muted-foreground/50"
        />
        <Select
          value={warehouseId || 'all'}
          onValueChange={(value) =>
            setWarehouseId(value === 'all' ? '' : (value ?? ''))
          }
        >
          <SelectTrigger className="w-56">
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {warehouseId
                ? data.warehouses.find(
                    (warehouse) => warehouse.id === warehouseId,
                  )?.name
                : 'Todos los depósitos'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los depósitos</SelectItem>
            {data.warehouses.map((warehouse) => (
              <SelectItem key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
                {!warehouse.isActive ? ' (inactivo)' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={categoryId || 'all'}
          onValueChange={(value) =>
            setCategoryId(value === 'all' ? '' : (value ?? ''))
          }
        >
          <SelectTrigger className="w-48">
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {categoryId
                ? categories.find((category) => category.id === categoryId)?.name
                : 'Todas las categorías'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={brandId || 'all'}
          onValueChange={(value) =>
            setBrandId(value === 'all' ? '' : (value ?? ''))
          }
        >
          <SelectTrigger className="w-40">
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {brandId
                ? brands.find((brand) => brand.id === brandId)?.name
                : 'Todas las marcas'}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las marcas</SelectItem>
            {brands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={onlyRestock ? 'default' : 'outline'}
          aria-pressed={onlyRestock}
          onClick={() => setOnlyRestock((value) => !value)}
          className="shrink-0"
        >
          <TriangleAlert size={14} />
          A reponer ({restockCount})
        </Button>
      </div>

      {!isLoading && data.warehouses.length === 0 && (
        <Card className="mb-4 flex-row items-center gap-3 p-4">
          <Warehouse size={20} className="text-muted-foreground" />
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              No hay depósitos configurados
            </p>
            <p className="text-xs text-muted-foreground">
              Creá un depósito para localizar las nuevas existencias.
            </p>
          </div>
          <Link
            href="/dashboard/settings/warehouses"
            className="text-sm font-medium text-primary hover:underline"
          >
            Configurar depósitos
          </Link>
        </Card>
      )}

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Cargando stock...
        </div>
      ) : isError ? (
        <div className="py-16 text-center text-sm text-destructive">
          No se pudo cargar el stock. Volvé a intentar en unos segundos.
        </div>
      ) : rows.length === 0 ? (
        <div className="py-16 text-center">
          <Package
            size={32}
            className="mx-auto mb-3 text-muted-foreground/40"
          />
          <p className="text-sm text-muted-foreground">
            {onlyRestock && data.items.length > 0
              ? 'Ningún producto necesita reposición con estos filtros.'
              : 'No hay productos habilitados para la venta con estos filtros.'}
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Categoría</th>
                  <th className="px-4 py-3 text-left">Marca</th>
                  <th className="px-4 py-3 text-left">Canales</th>
                  <th className="px-4 py-3 text-right">Precio venta</th>
                  {columns.map((column) => (
                    <th key={column.key} className="px-4 py-3 text-right">
                      <span>{column.label}</span>
                      {column.isInactive && (
                        <span className="ml-1 normal-case text-warn">
                          (inactivo)
                        </span>
                      )}
                    </th>
                  ))}
                  {canMove && (
                    <th className="px-4 py-3">
                      <span className="sr-only">Acciones</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => {
                  const level = stockLevel(
                    row.totalStock,
                    row.product.stockMin,
                  );
                  return (
                  <tr
                    key={row.product.id}
                    onClick={() =>
                      router.push(
                        `/dashboard/inventory/products/${row.product.id}`,
                      )
                    }
                    className={cn(
                      'cursor-pointer transition-colors hover:bg-muted/20',
                      level === 'out' && 'bg-destructive/5',
                      level === 'low' && 'bg-warn-subtle/40',
                    )}
                  >
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">
                          {row.product.name}
                        </p>
                        {level !== 'ok' && (
                          <Badge
                            variant={
                              level === 'out' ? 'destructive' : 'outline'
                            }
                            className={cn(
                              'text-[10px]',
                              level === 'low' &&
                                'border-warn/40 bg-warn-subtle text-warn',
                            )}
                          >
                            <TriangleAlert />
                            {LEVEL_LABEL[level]}
                          </Badge>
                        )}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">
                        {[
                          row.product.model,
                          row.product.stockMin > 0
                            ? `mín. ${row.product.stockMin}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.product.category?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {row.product.brand?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.product.salesChannels.map((channel) => (
                          <Badge
                            key={channel}
                            variant="outline"
                            className="text-[10px]"
                          >
                            {SALES_CHANNEL_LABEL[channel]}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-foreground">
                      {row.product.salePrice == null
                        ? '—'
                        : fmtGs(row.product.salePrice)}
                    </td>
                    {columns.map((column) => {
                      const quantity = stockQuantity(row, column);
                      return (
                        <td
                          key={column.key}
                          className={cn(
                            'px-4 py-3 text-right font-mono font-semibold tabular-nums',
                            column.kind === 'total'
                              ? LEVEL_TEXT[level]
                              : 'text-foreground',
                          )}
                        >
                          {quantity}
                          {column.kind === 'unassigned' &&
                            quantity !== 0 &&
                            canMove && (
                              <Button
                                variant="outline"
                                size="xs"
                                className="ml-2 font-sans"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setTransfer({
                                    productId: row.product.id,
                                    fromId: UNLOCATED_SOURCE,
                                    quantity: Math.abs(quantity),
                                  });
                                }}
                              >
                                Asignar
                              </Button>
                            )}
                        </td>
                      );
                    })}
                    {canMove && (
                      <td className="px-2 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Trasladar ${row.product.name} entre depósitos`}
                          title="Trasladar entre depósitos"
                          onClick={(event) => {
                            event.stopPropagation();
                            setTransfer({ productId: row.product.id });
                          }}
                        >
                          <ArrowLeftRight size={15} />
                        </Button>
                      </td>
                    )}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {transfer && (
        <StockTransferDialog
          productId={transfer.productId}
          fromId={transfer.fromId}
          quantity={transfer.quantity}
          onClose={() => setTransfer(null)}
        />
      )}
    </div>
  );
}
