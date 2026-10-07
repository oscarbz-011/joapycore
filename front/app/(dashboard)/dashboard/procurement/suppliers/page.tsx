'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { FileSpreadsheet, Pencil, Plus, Search } from 'lucide-react';
import { SupplierDialog } from '@/components/procurement/supplier-dialog';
import { RequirePermission } from '@/components/require-permission';
import { SortableHeader } from '@/components/sortable-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { usePermission } from '@/lib/permissions';
import {
  SUPPLIER_SORT,
  filterSuppliers,
  paymentTermLabel,
} from '@/lib/suppliers';
import { useTableSort } from '@/lib/use-table-sort';
import { procurementApi, type Supplier } from '../../../../../lib/api/procurement';

const EMPTY = <span className="text-muted-foreground">—</span>;

// ── Página ────────────────────────────────────────────────────────────────────

type DialogState = { mode: 'create' } | { mode: 'edit'; supplier: Supplier } | null;

export default function SuppliersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState<DialogState>(null);
  const canEdit = usePermission('suppliers:update');

  const {
    data: suppliers = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['suppliers'],
    queryFn: procurementApi.listSuppliers,
  });

  const filtered = filterSuppliers(suppliers, search);
  const { sorted, sort, toggle } = useTableSort(filtered, SUPPLIER_SORT);

  const openCatalog = (supplier: Supplier) =>
    router.push(`/dashboard/procurement/suppliers/${supplier.id}`);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Proveedores</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Proveedores registrados, sus condiciones de pago y su catálogo de precios
          </p>
        </div>
        <RequirePermission permission="suppliers:create">
          <Button onClick={() => setDialog({ mode: 'create' })}>
            <Plus size={16} />
            Nuevo proveedor
          </Button>
        </RequirePermission>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            size={14}
            aria-hidden
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
          />
          <Input
            className="pl-8"
            aria-label="Buscar proveedor"
            placeholder="Buscar por nombre, contacto, email o RUC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {!isLoading && !isError && (
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? 'proveedor' : 'proveedores'}
          </p>
        )}
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">
          Cargando proveedores...
        </div>
      ) : isError ? (
        <div className="py-16 text-center">
          <p className="text-sm text-destructive">No se pudieron cargar los proveedores.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">Todavía no hay proveedores cargados.</p>
          <RequirePermission permission="suppliers:create">
            <Button variant="outline" className="mt-4" onClick={() => setDialog({ mode: 'create' })}>
              <Plus size={15} />
              Crear el primero
            </Button>
          </RequirePermission>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            Ningún proveedor coincide con &ldquo;{search.trim()}&rdquo;.
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => setSearch('')}>
            Limpiar búsqueda
          </Button>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  <SortableHeader label="Proveedor" sortKey="name" sort={sort} onSort={toggle} />
                  <SortableHeader label="Contacto" sortKey="contact" sort={sort} onSort={toggle} />
                  <SortableHeader label="Email" sortKey="email" sort={sort} onSort={toggle} />
                  <SortableHeader label="Teléfono" sortKey="phone" sort={sort} onSort={toggle} />
                  <SortableHeader label="RUC" sortKey="taxId" sort={sort} onSort={toggle} />
                  <SortableHeader label="Plazo de pago" sortKey="term" sort={sort} onSort={toggle} className="whitespace-nowrap" />
                  <SortableHeader label="Tipo" sortKey="type" sort={sort} onSort={toggle} />
                  <SortableHeader label="Estado" sortKey="status" sort={sort} onSort={toggle} />
                  <th className="px-4 py-3 text-right">
                    <span className="sr-only">Acciones</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {sorted.map((supplier) => (
                  <tr
                    key={supplier.id}
                    onClick={() => openCatalog(supplier)}
                    className="cursor-pointer transition-colors hover:bg-muted/20"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">{supplier.name}</td>
                    <td className="px-4 py-3 text-foreground">{supplier.contactName ?? EMPTY}</td>
                    <td className="px-4 py-3 text-foreground">{supplier.email ?? EMPTY}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-foreground">
                      {supplier.phone ?? EMPTY}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-foreground">
                      {supplier.taxId ?? EMPTY}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {paymentTermLabel(supplier.paymentTermDays)}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {supplier.isImporter ? 'Importador' : 'Local'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={supplier.isActive ? 'secondary' : 'outline'}>
                        {supplier.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openCatalog(supplier);
                          }}
                        >
                          <FileSpreadsheet size={14} />
                          Catálogo
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDialog({ mode: 'edit', supplier });
                          }}
                        >
                          <Pencil size={14} />
                          {canEdit ? 'Editar' : 'Ver datos'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {dialog?.mode === 'create' && <SupplierDialog onClose={() => setDialog(null)} />}
      {dialog?.mode === 'edit' && (
        <SupplierDialog
          key={dialog.supplier.id}
          supplier={dialog.supplier}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
