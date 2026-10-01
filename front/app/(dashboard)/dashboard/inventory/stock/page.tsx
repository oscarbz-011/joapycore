'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Package, Search, SlidersHorizontal, Warehouse } from 'lucide-react';
import {
  inventoryApi,
  SALES_CHANNEL_LABEL,
  type StockResult,
} from '../../../../../lib/api/inventory';
import {
  stockColumns,
  stockQuantity,
} from '../../../../../lib/inventory-stock';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';

const EMPTY_STOCK: StockResult = { warehouses: [], items: [] };

export default function StockPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['inventory-categories'],
    queryFn: inventoryApi.listCategories,
  });
  const { data: brands = [] } = useQuery({
    queryKey: ['inventory-brands'],
    queryFn: inventoryApi.listBrands,
  });
  const { data = EMPTY_STOCK, isLoading } = useQuery({
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

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-[25px] font-extrabold tracking-tight text-foreground">
          Stock
        </h1>
        <p className="mt-1 text-[14px] text-muted-foreground">
          Inventario físico disponible para la venta, total y por depósito
        </p>
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
      ) : data.items.length === 0 ? (
        <div className="py-16 text-center">
          <Package
            size={32}
            className="mx-auto mb-3 text-muted-foreground/40"
          />
          <p className="text-sm text-muted-foreground">
            No hay productos habilitados para la venta con estos filtros.
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.items.map((row) => (
                  <tr
                    key={row.product.id}
                    onClick={() =>
                      router.push(
                        `/dashboard/inventory/products/${row.product.id}`,
                      )
                    }
                    className="cursor-pointer transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">
                        {row.product.name}
                      </p>
                      {row.product.model && (
                        <p className="font-mono text-xs text-muted-foreground">
                          {row.product.model}
                        </p>
                      )}
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
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className="px-4 py-3 text-right font-mono font-semibold tabular-nums text-foreground"
                      >
                        {stockQuantity(row, column)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
