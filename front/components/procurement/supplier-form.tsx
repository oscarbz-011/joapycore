'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { TierRows } from '@/components/procurement/tier-rows';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api/api-error';
import { procurementApi, type Supplier } from '@/lib/api/procurement';
import { usePermission } from '@/lib/permissions';
import {
  emptySupplierForm,
  supplierFormFrom,
  supplierTermsError,
  toSupplierPayload,
  type SupplierForm as SupplierFormValues,
} from '@/lib/suppliers';

const SUPPLIERS_PATH = '/dashboard/procurement/suppliers';

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="gap-4 p-5">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </Card>
  );
}

/**
 * Alta (sin `supplier`) o edición de un proveedor, a pantalla completa: los
 * datos de contacto, las condiciones comerciales y los descuentos no entraban
 * cómodos en un diálogo.
 */
export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SupplierFormValues>(() =>
    supplier ? supplierFormFrom(supplier) : emptySupplierForm(),
  );
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const canCreate = usePermission('suppliers:create');
  const canEdit = usePermission('suppliers:update');
  const canSave = supplier ? canEdit : canCreate;
  // Al terminar se vuelve a donde se estaba: la ficha al editar, la lista al crear.
  const backPath = supplier ? `${SUPPLIERS_PATH}/${supplier.id}` : SUPPLIERS_PATH;

  function set<K extends keyof SupplierFormValues>(key: K, value: SupplierFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: ['suppliers'] });
    void queryClient.invalidateQueries({ queryKey: ['catalog-offers'] });
    if (supplier) void queryClient.invalidateQueries({ queryKey: ['supplier', supplier.id] });
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = toSupplierPayload(form);
      return supplier
        ? procurementApi.updateSupplier(supplier.id, payload)
        : procurementApi.createSupplier(payload);
    },
    onSuccess: (saved) => {
      refresh();
      router.push(`${SUPPLIERS_PATH}/${saved.id}`);
    },
    onError: (err: Error) => setError(apiErrorMessage(err, 'No se pudo guardar el proveedor')),
  });

  const deleteMutation = useMutation({
    mutationFn: () => procurementApi.deleteSupplier(supplier!.id),
    onSuccess: () => {
      refresh();
      router.push(SUPPLIERS_PATH);
    },
    onError: (err: Error) => setError(apiErrorMessage(err, 'No se pudo eliminar el proveedor')),
  });

  const busy = saveMutation.isPending || deleteMutation.isPending;
  const locked = !canSave || busy;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const problem = supplierTermsError(form);
        setError(problem ?? '');
        if (!problem) saveMutation.mutate();
      }}
    >
      <Link
        href={backPath}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden />
        {supplier ? 'Volver al proveedor' : 'Volver a proveedores'}
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          {supplier ? 'Editar proveedor' : 'Nuevo proveedor'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {supplier
            ? supplier.name
            : 'Datos de contacto, condiciones de pago y descuentos del proveedor.'}
        </p>
      </div>

      <div className="space-y-6 pb-24">
        <Section title="Datos del proveedor">
          <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
            <div className="flex items-end pb-2">
              <Label className="flex cursor-pointer items-center gap-2.5 font-normal">
                <Checkbox
                  checked={form.isImporter}
                  onCheckedChange={(checked) => set('isImporter', checked === true)}
                />
                Es importador
              </Label>
            </div>
          </fieldset>
        </Section>

        <Section
          title="Pago y entrega"
          description="Lo que quede vacío figura como “sin dato” al comparar proveedores; no cuenta como cero."
        >
          <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              <p id="supplier-term-help" className="text-xs text-muted-foreground">
                0 = contado. Con un plazo, las cuentas por pagar vencen esa cantidad de días
                después de recibir la mercadería.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="supplier-shipping">Costo de envío (Gs.)</Label>
              <Input
                id="supplier-shipping"
                type="number"
                min={0}
                step="any"
                value={form.shippingCost}
                onChange={(e) => set('shippingCost', e.target.value)}
                placeholder="Sin dato"
              />
              <p className="text-xs text-muted-foreground">Por orden. 0 = sin cargo.</p>
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
                placeholder="Sin dato"
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
                placeholder="Sin dato"
              />
            </div>
          </fieldset>
        </Section>

        <Section
          title="Descuentos por volumen"
          description="Cada proveedor descuenta a su manera: por lo que suma la orden, por la cantidad de unidades, o las dos cosas. Si aplican las dos, rige la que más descuenta. Los precios por cantidad de un producto en particular se cargan en su ítem del catálogo."
        >
          <fieldset disabled={locked} className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Por el total de la orden</p>
              <TierRows
                rows={form.volumeDiscounts}
                onChange={(rows) => set('volumeDiscounts', rows)}
                fromLabel="Desde (Gs.)"
                valueLabel="Descuento (%)"
                addLabel="Agregar tramo"
                emptyText="Sin descuentos por monto."
                disabled={locked}
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                Por la cantidad de unidades de la orden
              </p>
              <TierRows
                rows={form.quantityDiscounts}
                onChange={(rows) => set('quantityDiscounts', rows)}
                fromLabel="Desde (unidades)"
                valueLabel="Descuento (%)"
                addLabel="Agregar tramo"
                emptyText="Sin descuentos por cantidad."
                disabled={locked}
              />
              <p className="text-xs text-muted-foreground">
                Ejemplo: desde 1 → 2%, desde 5 → 5%, desde 51 → 10% (menos de 5, de 5 a 50, más
                de 50).
              </p>
            </div>
          </fieldset>
        </Section>

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}
      </div>

      {/* Acciones siempre a la vista, aunque el formulario sea largo. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        {confirmDelete ? (
          <>
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
          </>
        ) : (
          <>
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
              <Button type="button" variant="outline" onClick={() => router.push(backPath)}>
                {canSave ? 'Cancelar' : 'Volver'}
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
          </>
        )}
      </div>
    </form>
  );
}
