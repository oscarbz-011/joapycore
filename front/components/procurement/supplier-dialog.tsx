'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { procurementApi, type Supplier } from '@/lib/api/procurement';
import { usePermission } from '@/lib/permissions';
import { TierRows } from '@/components/procurement/tier-rows';
import {
  emptySupplierForm,
  supplierFormFrom,
  supplierTermsError,
  toSupplierPayload,
  type SupplierForm,
} from '@/lib/suppliers';

/** Alta (sin `supplier`) o edición de un proveedor. */
export function SupplierDialog({
  supplier,
  onClose,
  onDeleted,
}: {
  supplier?: Supplier;
  onClose: () => void;
  /** Después de eliminar; por defecto solo cierra. */
  onDeleted?: () => void;
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

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    if (supplier) {
      void queryClient.invalidateQueries({ queryKey: ['supplier', supplier.id] });
    }
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = toSupplierPayload(form);
      return supplier
        ? procurementApi.updateSupplier(supplier.id, payload)
        : procurementApi.createSupplier(payload);
    },
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (err: Error) => setError(apiErrorMessage(err, 'No se pudo guardar el proveedor')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => procurementApi.deleteSupplier(supplier!.id),
    onSuccess: () => {
      refresh();
      (onDeleted ?? onClose)();
    },
    onError: (err: Error) => setError(apiErrorMessage(err, 'No se pudo eliminar el proveedor')),
  });

  const busy = saveMutation.isPending || deleteMutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
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
            const problem = supplierTermsError(form);
            setError(problem ?? '');
            if (!problem) saveMutation.mutate();
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

          <fieldset disabled={!canSave || busy} className="space-y-4 border-t border-border pt-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Condiciones comerciales</p>
              <p className="text-xs text-muted-foreground">
                Opcionales. Se usan para comparar proveedores; lo que quede vacío figura como
                &ldquo;sin dato&rdquo;.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="supplier-shipping">Costo de envío (Gs.)</Label>
                <Input
                  id="supplier-shipping"
                  type="number"
                  min={0}
                  step="any"
                  value={form.shippingCost}
                  onChange={(e) => set('shippingCost', e.target.value)}
                  placeholder="Por orden"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-lead-time">Plazo de entrega (días)</Label>
                <Input
                  id="supplier-lead-time"
                  type="number"
                  min={0}
                  step={1}
                  value={form.leadTimeDays}
                  onChange={(e) => set('leadTimeDays', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supplier-min-order">Pedido mínimo (Gs.)</Label>
                <Input
                  id="supplier-min-order"
                  type="number"
                  min={0}
                  step="any"
                  value={form.minOrderAmount}
                  onChange={(e) => set('minOrderAmount', e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">
                Descuento por el total de la orden
              </p>
              <TierRows
                rows={form.volumeDiscounts}
                onChange={(rows) => set('volumeDiscounts', rows)}
                fromLabel="Desde (Gs.)"
                valueLabel="Descuento (%)"
                addLabel="Agregar descuento"
                emptyText="Sin descuentos por volumen. Los precios por cantidad de cada producto se cargan en el catálogo."
              />
            </div>
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
