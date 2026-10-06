'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LookupSelect } from '@/components/inventory/lookup-select';
import { NumericInput } from '@/components/numeric-input';
import { Badge } from '@/components/ui/badge';
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
import { Label } from '@/components/ui/label';
import { apiErrorMessage } from '@/lib/api/api-error';
import { inventoryApi } from '@/lib/api/inventory';
import { procurementApi } from '@/lib/api/procurement';
import { settingsApi } from '@/lib/api/settings';
import { suggestedSalePrice } from '@/lib/catalog-product';
import {
  newProductPayload,
  orderPayload,
  orderPlan,
  staysDraft,
  type NewProductForm,
} from '@/lib/compare-order';
import { todayISODate } from '@/lib/date';
import type { SupplierQuote } from '@/lib/supplier-comparison';

const NUM_CLS =
  'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

const gs = (n: number) => 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));

const CATEGORIES_KEY = ['inventory-categories'] as const;

/**
 * Crea la orden de compra con el proveedor elegido en la comparación. Es el
 * momento en que los ítems que todavía no tenían producto pasan a tenerlo.
 */
export function CompareOrderDialog({
  quote,
  quotes,
  onClose,
}: {
  quote: SupplierQuote;
  quotes: readonly SupplierQuote[];
  onClose: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const plan = orderPlan(quote, quotes);
  const [error, setError] = useState('');
  // Productos ya creados en un intento anterior: si algo falla a mitad de
  // camino, reintentar no los crea de nuevo.
  const [created, setCreated] = useState<Record<string, string>>({});

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: inventoryApi.listCategories,
  });
  const { data: pricing } = useQuery({
    queryKey: ['pricing-config'],
    queryFn: settingsApi.getPricing,
  });

  const [forms, setForms] = useState<Record<string, Partial<NewProductForm>>>({});
  // El precio de venta sigue al sugerido hasta que se escribe otro.
  const formOf = (itemId: string): NewProductForm => {
    const product = plan.newProducts.find((p) => p.itemId === itemId)!;
    const form = forms[itemId] ?? {};
    return {
      name: form.name ?? product.name,
      categoryId: form.categoryId ?? '',
      salePrice: form.salePrice ?? suggestedSalePrice(product.costPrice, pricing),
    };
  };
  const patch = (itemId: string, change: Partial<NewProductForm>) =>
    setForms((prev) => ({ ...prev, [itemId]: { ...prev[itemId], ...change } }));

  const draftCount = plan.newProducts.filter((p) => staysDraft(formOf(p.itemId))).length;

  const mutation = useMutation({
    mutationFn: async () => {
      const productOf: Record<string, string> = {};

      for (const product of plan.newProducts) {
        let productId = created[product.itemId];
        if (!productId) {
          const saved = await inventoryApi.createProduct(
            newProductPayload(product, formOf(product.itemId)),
          );
          productId = saved.id;
          const savedId = saved.id;
          setCreated((prev) => ({ ...prev, [product.itemId]: savedId }));
        }
        productOf[product.itemId] = productId;
        // El ítem elegido y sus equivalentes en las otras listas quedan
        // vinculados al mismo producto: la próxima comparación ya los conoce.
        for (const itemId of [product.itemId, ...product.siblingItemIds]) {
          await procurementApi.mapCatalogItem(itemId, productId);
        }
      }
      for (const link of plan.links) {
        await procurementApi.mapCatalogItem(link.itemId, link.productId);
      }

      return procurementApi.createOrder(
        orderPayload(
          quote.supplier.id,
          todayISODate(),
          plan.lines.map((line) => ({
            itemId: line.itemId,
            productId: line.productId ?? productOf[line.itemId],
            quantity: line.quantity,
            unitCost: line.unitCost,
          })),
        ),
      );
    },
    onSuccess: (order) => {
      for (const key of ['purchase-orders', 'catalog-offers', 'catalog-search', 'supplier-catalog', 'products']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
      router.push(`/dashboard/procurement/orders/${order.id}`);
    },
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo crear la orden')),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && !mutation.isPending && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Crear orden de compra</DialogTitle>
          <DialogDescription>
            Con {quote.supplier.name}. Queda en borrador: la revisás y la enviás desde la orden.
          </DialogDescription>
        </DialogHeader>

        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border bg-muted/30 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2 text-left whitespace-nowrap">Cód. proveedor</th>
                <th className="px-3 py-2 text-left">Ítem</th>
                <th className="px-3 py-2 text-right">Cantidad</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Costo unit.</th>
                <th className="px-3 py-2 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {plan.lines.map((line) => (
                <tr key={line.itemId}>
                  <td className="px-3 py-2 font-mono text-xs whitespace-nowrap text-muted-foreground">
                    {line.supplierSku}
                  </td>
                  <td className="px-3 py-2 text-foreground">{line.description}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-foreground">
                    {line.quantity}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap text-muted-foreground">
                    {gs(line.unitCost)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums whitespace-nowrap text-foreground">
                    {gs(line.quantity * line.unitCost)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {plan.newProducts.length > 0 && (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Productos nuevos ({plan.newProducts.length})
              </p>
              <p className="text-xs text-muted-foreground">
                Estos ítems todavía no existen en tu inventario. Podés completar la categoría y
                el precio de venta ahora, o dejarlos vacíos: el producto queda en borrador y
                se completa antes de recibir la mercadería.
              </p>
            </div>
            {plan.newProducts.map((product) => {
              const form = formOf(product.itemId);
              const done = Boolean(created[product.itemId]);
              return (
                <fieldset
                  key={product.itemId}
                  disabled={mutation.isPending || done}
                  className="grid gap-3 rounded-xl border border-border p-3 sm:grid-cols-2"
                >
                  <div className="space-y-1.5 sm:col-span-2">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`new-product-${product.itemId}`}>Nombre del producto</Label>
                      <Badge variant={staysDraft(form) ? 'outline' : 'secondary'}>
                        {staysDraft(form) ? 'Queda en borrador' : 'Queda activo'}
                      </Badge>
                    </div>
                    <Input
                      id={`new-product-${product.itemId}`}
                      value={form.name}
                      onChange={(e) => patch(product.itemId, { name: e.target.value })}
                    />
                  </div>
                  <LookupSelect
                    label="Categoría"
                    emptyLabel="Sin categoría por ahora"
                    items={categories}
                    loading={loadingCategories}
                    value={form.categoryId}
                    onChange={(id) => patch(product.itemId, { categoryId: id })}
                    create={inventoryApi.createCategory}
                    managePermission="inventory:categories:manage"
                    queryKey={CATEGORIES_KEY}
                    disabled={mutation.isPending || done}
                  />
                  <div className="space-y-1.5">
                    <Label htmlFor={`new-product-sale-${product.itemId}`}>
                      Precio de venta (Gs.)
                    </Label>
                    <NumericInput
                      id={`new-product-sale-${product.itemId}`}
                      className={NUM_CLS}
                      decimals={2}
                      value={form.salePrice}
                      onChange={(value) => patch(product.itemId, { salePrice: value })}
                    />
                    <p className="text-xs text-muted-foreground">Costo: {gs(product.costPrice)}</p>
                  </div>
                </fieldset>
              );
            })}
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
        )}

        <DialogFooter className="items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {draftCount > 0
              ? `${draftCount} ${draftCount === 1 ? 'producto queda' : 'productos quedan'} en borrador.`
              : ''}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={mutation.isPending}
              onClick={() => {
                setError('');
                mutation.mutate();
              }}
            >
              {mutation.isPending ? 'Creando...' : 'Crear orden'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
