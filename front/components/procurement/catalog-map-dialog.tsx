'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, PackagePlus, Search } from 'lucide-react';
import { LookupSelect } from '@/components/inventory/lookup-select';
import { NumericInput } from '@/components/numeric-input';
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
import { inventoryApi, type Product } from '@/lib/api/inventory';
import { procurementApi, type SupplierCatalogItem } from '@/lib/api/procurement';
import { settingsApi } from '@/lib/api/settings';
import {
  catalogProductError,
  catalogProductFormFrom,
  markupLabel,
  suggestedSalePrice,
  toCatalogProductPayload,
  type CatalogProductForm,
} from '@/lib/catalog-product';
import { priceValidity, validityLabel } from '@/lib/catalog-validity';
import { localISODate } from '@/lib/date';
import { cn } from '@/lib/utils';

const NUM_CLS =
  'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

const MODES = [
  { value: 'existing', label: 'Producto existente', icon: Link2 },
  { value: 'new', label: 'Crear producto nuevo', icon: PackagePlus },
] as const;

type Mode = (typeof MODES)[number]['value'];

// Las mismas claves que usan Inventario y sus pantallas de categorías y
// marcas: un alta hecha acá aparece allá sin recargar.
const CATEGORIES_KEY = ['inventory-categories'] as const;
const BRANDS_KEY = ['inventory-brands'] as const;

function ErrorNote({ children }: { children: string }) {
  return (
    <p
      role="alert"
      className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {children}
    </p>
  );
}

// Un buscador y no un Select: el catálogo interno puede tener cientos de fichas
// y el ítem del proveedor ya trae la descripción para arrancar la búsqueda.
function ExistingProduct({
  item,
  onDone,
}: {
  item: SupplierCatalogItem;
  onDone: () => void;
}) {
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['products-active-for-mapping'],
    queryFn: () => inventoryApi.listProducts({ status: 'ACTIVE' }),
  });

  const mutation = useMutation({
    mutationFn: (productId: string) => procurementApi.mapCatalogItem(item.id, productId),
    onSuccess: onDone,
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo vincular el producto')),
  });

  const q = search.trim().toLowerCase();
  const matches = (
    q
      ? products.filter((p: Product) =>
          `${p.name} ${p.model ?? ''} ${p.brand?.name ?? ''}`.toLowerCase().includes(q),
        )
      : products
  ).slice(0, 60);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={14}
          aria-hidden
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
        />
        <Input
          className="pl-8"
          autoFocus
          aria-label="Buscar producto"
          placeholder="Buscar producto por nombre, modelo o marca..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="max-h-72 overflow-y-auto rounded-xl border border-border">
        {isLoading ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            Cargando productos...
          </p>
        ) : matches.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            No hay productos activos que coincidan. Podés crearlo desde &ldquo;Crear producto
            nuevo&rdquo;.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {matches.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(p.id)}
                  className="w-full px-3 py-2.5 text-left transition-colors hover:bg-muted/30 disabled:opacity-50"
                >
                  <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[p.model, p.brand?.name, p.unit].filter(Boolean).join(' · ')}
                  </p>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!isLoading && products.length > matches.length && (
        <p className="text-xs text-muted-foreground">
          Mostrando {matches.length} de {products.length} productos. Afiná la búsqueda para ver
          el resto.
        </p>
      )}
    </div>
  );
}

function NewProduct({
  item,
  onDone,
  onCancel,
}: {
  item: SupplierCatalogItem;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CatalogProductForm>(() => catalogProductFormFrom(item));
  const [error, setError] = useState('');
  // Si el producto se creó pero falló el vínculo, reintentar solo vincula:
  // crear de nuevo duplicaría el producto.
  const [createdId, setCreatedId] = useState<string | null>(null);

  const { data: pricing } = useQuery({
    queryKey: ['pricing-config'],
    queryFn: settingsApi.getPricing,
  });
  // El precio de venta sigue al sugerido (costo + margen de la empresa) hasta
  // que el usuario escribe el suyo, igual que en el alta de productos.
  const [saleEdited, setSaleEdited] = useState(false);
  const suggested = suggestedSalePrice(form.costPrice, pricing);
  const salePrice = saleEdited ? form.salePrice : suggested;
  const product = { ...form, salePrice };

  const { data: categories = [], isLoading: loadingCategories } = useQuery({
    queryKey: CATEGORIES_KEY,
    queryFn: inventoryApi.listCategories,
  });
  const { data: brands = [] } = useQuery({
    queryKey: BRANDS_KEY,
    queryFn: inventoryApi.listBrands,
  });

  function set<K extends keyof CatalogProductForm>(key: K, value: CatalogProductForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      let productId = createdId;
      if (!productId) {
        const created = await inventoryApi.createProduct(toCatalogProductPayload(product));
        productId = created.id;
        setCreatedId(productId);
        void queryClient.invalidateQueries({ queryKey: ['products'] });
        void queryClient.invalidateQueries({ queryKey: ['products-active-for-mapping'] });
      }
      return procurementApi.mapCatalogItem(item.id, productId);
    },
    onSuccess: onDone,
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo completar la operación')),
  });

  const today = localISODate(new Date());
  const priceExpired = priceValidity(item, today).status === 'expired';

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const problem = createdId ? null : catalogProductError(product);
        setError(problem ?? '');
        if (!problem) mutation.mutate();
      }}
    >
      <fieldset
        disabled={mutation.isPending || createdId !== null}
        className="grid gap-4 sm:grid-cols-2"
      >
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="catalog-product-name">Nombre del producto *</Label>
          <Input
            id="catalog-product-name"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            autoFocus
          />
        </div>

        <div className="sm:col-span-2">
          <LookupSelect
            label="Categoría"
            required
            emptyLabel="— Seleccionar —"
            items={categories}
            loading={loadingCategories}
            value={form.categoryId}
            onChange={(id) => set('categoryId', id)}
            create={inventoryApi.createCategory}
            managePermission="inventory:categories:manage"
            queryKey={CATEGORIES_KEY}
          />
        </div>
        <div className="sm:col-span-2">
          <LookupSelect
            label="Marca"
            emptyLabel="Sin marca"
            items={brands}
            value={form.brandId}
            onChange={(id) => set('brandId', id)}
            create={inventoryApi.createBrand}
            managePermission="inventory:brands:manage"
            queryKey={BRANDS_KEY}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="catalog-product-cost">Precio de costo (Gs.) *</Label>
          <NumericInput
            id="catalog-product-cost"
            className={NUM_CLS}
            decimals={2}
            value={form.costPrice}
            onChange={(value) => set('costPrice', value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="catalog-product-sale">Precio de venta (Gs.) *</Label>
          <NumericInput
            id="catalog-product-sale"
            className={NUM_CLS}
            decimals={2}
            value={salePrice}
            onChange={(value) => {
              setSaleEdited(true);
              set('salePrice', value);
            }}
            aria-describedby="catalog-product-sale-help"
          />
        </div>
        {pricing && suggested > 0 && (
          <p
            id="catalog-product-sale-help"
            className="-mt-2 text-xs text-muted-foreground sm:col-span-2"
          >
            Sugerido: Gs. {new Intl.NumberFormat('es-PY').format(suggested)} (costo + margen
            de {markupLabel(pricing)}).
            {saleEdited && salePrice !== suggested && (
              <>
                {' '}
                <button
                  type="button"
                  onClick={() => setSaleEdited(false)}
                  className="font-medium text-primary underline underline-offset-2"
                >
                  Usar el sugerido
                </button>
              </>
            )}
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="catalog-product-unit">Unidad de medida</Label>
          <Input
            id="catalog-product-unit"
            value={form.unit}
            onChange={(e) => set('unit', e.target.value)}
            placeholder="unidad"
          />
        </div>
        <div className="flex items-end pb-2">
          <Label className="flex cursor-pointer items-center gap-2.5 font-normal">
            <Checkbox
              checked={form.isSerialized}
              onCheckedChange={(checked) => set('isSerialized', checked === true)}
            />
            Se controla por número de serie
          </Label>
        </div>
      </fieldset>

      <p className="rounded-xl border border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {createdId
          ? 'El producto ya se creó, pero no quedó vinculado a este ítem. Reintentá el vínculo.'
          : 'El producto queda activo y vinculado a este ítem, listo para una orden de compra. Se habilita para la venta al recibir la primera mercadería.'}
      </p>

      {priceExpired && !createdId && (
        <p className="rounded-xl border border-warn/40 bg-warn-subtle px-3 py-2 text-xs text-warn">
          El precio de lista de este ítem ya no rige ({validityLabel(item, today).toLowerCase()}).
          Revisá el costo antes de crear el producto.
        </p>
      )}

      {error && <ErrorNote>{error}</ErrorNote>}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {createdId ? 'Cerrar' : 'Cancelar'}
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending
            ? 'Guardando...'
            : createdId
              ? 'Reintentar el vínculo'
              : 'Crear y vincular'}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Vincula un ítem del catálogo del proveedor a un producto existente o nuevo. */
export function CatalogMapDialog({
  item,
  onClose,
}: {
  item: SupplierCatalogItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<Mode>('existing');

  function done() {
    void queryClient.invalidateQueries({ queryKey: ['supplier-catalog'] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Vincular a un producto</DialogTitle>
          <DialogDescription>
            <span className="font-mono">{item.supplierSku}</span> · {item.description}
          </DialogDescription>
        </DialogHeader>

        <div
          role="tablist"
          aria-label="Cómo vincular"
          className="grid grid-cols-2 gap-1 rounded-2xl bg-muted/30 p-1"
        >
          {MODES.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
                mode === value
                  ? 'bg-card text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon size={14} aria-hidden />
              {label}
            </button>
          ))}
        </div>

        {mode === 'existing' ? (
          <ExistingProduct item={item} onDone={done} />
        ) : (
          <NewProduct item={item} onDone={done} onCancel={onClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
