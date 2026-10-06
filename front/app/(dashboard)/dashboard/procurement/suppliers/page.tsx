'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { RequirePermission } from '@/components/require-permission';
import { SortableHeader } from '@/components/sortable-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api/api-error';
import { usePermission } from '@/lib/permissions';
import {
  SUPPLIER_SORT,
  emptySupplierForm,
  filterSuppliers,
  paymentTermLabel,
  supplierFormFrom,
  toSupplierPayload,
  type SupplierForm,
} from '@/lib/suppliers';
import { useTableSort } from '@/lib/use-table-sort';
import { procurementApi, type Supplier } from '../../../../../lib/api/procurement';

// ── Alta / edición ────────────────────────────────────────────────────────────

function SupplierDialog({
  supplier,
  onClose,
}: {
  supplier?: Supplier;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SupplierForm>(
    supplier ? supplierFormFrom(supplier) : emptySupplierForm(),
  );
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canCreate = usePermission('suppliers:create');
  const canEdit = usePermission('suppliers:update');
  const canSave = supplier ? canEdit : canCreate;

  function set<K extends keyof SupplierForm>(key: K, value: SupplierForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function done() {
    void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    onClose();
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = toSupplierPayload(form);
      return supplier
        ? procurementApi.updateSupplier(supplier.id, payload)
        : procurementApi.createSupplier(payload);
    },
    onSuccess: done,
    onError: (err: Error) => setError(apiErrorMessage(err, 'No se pudo guardar el proveedor')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => procurementApi.deleteSupplier(supplier!.id),
    onSuccess: done,
    onError: (err: Error) => setError(apiErrorMessage(err, 'No se pudo eliminar el proveedor')),
  });

  const busy = saveMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{supplier ? 'Editar proveedor' : 'Nuevo proveedor'}</DialogTitle>
          <DialogDescription>
            {supplier
              ? supplier.name
              : 'Datos de contacto y condiciones de pago del proveedor.'}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError('');
            saveMutation.mutate();
          }}
          className="space-y-4"
        >
          <fieldset disabled={!canSave || busy} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="supplier-name">Nombre / Razón social *</Label>
              <Input
                id="supplier-name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                autoFocus={!supplier}
                placeholder="Importadora ABC S.A."
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplier-tax-id">RUC</Label>
              <Input
                id="supplier-tax-id"
                value={form.taxId}
                onChange={(e) => set('taxId', e.target.value)}
                placeholder="80012345-6"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-contact">Contacto</Label>
              <Input
                id="supplier-contact"
                value={form.contactName}
                onChange={(e) => set('contactName', e.target.value)}
                placeholder="Juan Pérez"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplier-email">Email</Label>
              <Input
                id="supplier-email"
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="ventas@proveedor.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-phone">Teléfono</Label>
              <Input
                id="supplier-phone"
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="021 000 000"
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="supplier-address">Dirección</Label>
              <Input
                id="supplier-address"
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="Av. Eusebio Ayala 1234, Asunción"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="supplier-term">Plazo de pago (días)</Label>
              <Input
                id="supplier-term"
                type="number"
                min={0}
                step={1}
                value={form.paymentTermDays}
                onChange={(e) => set('paymentTermDays', e.target.value)}
                aria-describedby="supplier-term-help"
              />
            </div>
            <div className="flex items-end pb-2">
              <Label className="flex cursor-pointer items-center gap-2.5 font-normal">
                <Checkbox
                  checked={form.isImporter}
                  onCheckedChange={(checked) => set('isImporter', checked === true)}
                />
                Es importador
              </Label>
            </div>
            <p id="supplier-term-help" className="text-xs text-muted-foreground sm:col-span-2">
              0 = contado. Con un plazo, las cuentas por pagar de este proveedor vencen esa
              cantidad de días después de recibir la mercadería.
            </p>
          </fieldset>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          {confirmDelete ? (
            <DialogFooter className="items-center sm:justify-between">
              <p className="text-sm text-destructive">¿Eliminar este proveedor?</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmDelete(false)}
                  disabled={busy}
                >
                  No, conservar
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={busy}
                >
                  {deleteMutation.isPending ? 'Eliminando...' : 'Sí, eliminar'}
                </Button>
              </div>
            </DialogFooter>
          ) : (
            <DialogFooter className="sm:justify-between">
              {supplier && canEdit ? (
                <Button
                  type="button"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                  disabled={busy}
                >
                  <Trash2 size={15} />
                  Eliminar
                </Button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  {canSave ? 'Cancelar' : 'Cerrar'}
                </Button>
                {canSave && (
                  <Button type="submit" disabled={busy}>
                    {saveMutation.isPending
                      ? 'Guardando...'
                      : supplier
                        ? 'Guardar cambios'
                        : 'Crear proveedor'}
                  </Button>
                )}
              </div>
            </DialogFooter>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
                  <SortableHeader label="RUC" sortKey="taxId" sort={sort} onSort={toggle} />
                  <SortableHeader label="Plazo de pago" sortKey="term" sort={sort} onSort={toggle} />
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{supplier.name}</span>
                        {supplier.isImporter && <Badge variant="secondary">Importador</Badge>}
                      </div>
                      {supplier.address && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{supplier.address}</p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {supplier.contactName || supplier.email || supplier.phone ? (
                        <>
                          <p className="text-foreground">{supplier.contactName ?? '—'}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {[supplier.email, supplier.phone].filter(Boolean).join(' · ')}
                          </p>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-foreground">
                      {supplier.taxId ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      {paymentTermLabel(supplier.paymentTermDays)}
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
