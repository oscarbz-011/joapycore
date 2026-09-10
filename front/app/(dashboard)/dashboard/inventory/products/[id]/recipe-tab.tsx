'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Hammer, Trash2 } from 'lucide-react';
import { NumericInput } from '../../../../../../components/numeric-input';
import { inventoryApi } from '../../../../../../lib/api/inventory';
import { productionApi } from '../../../../../../lib/api/production';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const NUM_CLS =
  'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

function fmtGs(n: number) {
  return 'Gs. ' + new Intl.NumberFormat('es-PY').format(Math.round(n));
}

function fmtQty(n: number) {
  // Las cantidades son decimales (0,5 l de barniz) pero la mayoría son
  // enteras: se muestran sin decimales cuando no hacen falta.
  return new Intl.NumberFormat('es-PY', { maximumFractionDigits: 3 }).format(n);
}

/**
 * Receta de un producto fabricado: de qué está hecho y cuánto lleva de cada
 * cosa. Solo se muestra para productos MANUFACTURED — ver ProductKind.
 */
export function RecipeTab({ productId, unit }: { productId: string; unit: string }) {
  const queryClient = useQueryClient();
  const [componentId, setComponentId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [error, setError] = useState('');

  const { data: recipe = [], isLoading } = useQuery({
    queryKey: ['product-recipe', productId],
    queryFn: () => productionApi.getRecipe(productId),
  });

  // Candidatos a componente: cualquier producto activo que no sea este mismo.
  // La validación real (ciclos, duplicados) vive en el backend.
  const { data: products = [] } = useQuery({
    queryKey: ['inventory-products-for-recipe'],
    queryFn: () => inventoryApi.listProducts({ status: 'ACTIVE' }),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['product-recipe', productId] });
  };

  const addMutation = useMutation({
    mutationFn: () => productionApi.addComponent(productId, { componentId, quantity }),
    onSuccess: () => {
      setComponentId('');
      setQuantity(0);
      setError('');
      invalidate();
    },
    onError: (err: Error & { response?: { data?: { message?: string | string[] } } }) => {
      const msg = err?.response?.data?.message;
      setError(Array.isArray(msg) ? msg[0] : (msg ?? 'No se pudo agregar el componente'));
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => productionApi.removeComponent(productId, id),
    onSuccess: invalidate,
  });

  const alreadyUsed = new Set(recipe.map((r) => r.componentId));
  const available = products.filter((p) => p.id !== productId && !alreadyUsed.has(p.id));

  // Costo de fabricar una unidad, sumando lo que cuesta cada componente. Es
  // una referencia: los componentes sin costo cargado no suman.
  const unitCost = recipe.reduce(
    (sum, r) => sum + Number(r.quantity) * Number(r.component.costPrice ?? 0),
    0,
  );
  const missingCost = recipe.some((r) => r.component.costPrice == null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-muted/30" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {recipe.length === 0 ? (
        <div className="rounded-xl border border-border bg-card px-4 py-6 text-center">
          <Hammer size={20} className="mx-auto text-muted-foreground/40" />
          <p className="mt-2 text-sm text-muted-foreground">
            Este producto todavía no tiene receta.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/70">
            Cargá de qué está hecho para poder crear órdenes de producción.
          </p>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Cantidades por <strong>1 {unit}</strong> producida.
          </p>
          <div className="space-y-2">
            {recipe.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground">{r.component.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtQty(Number(r.quantity))} {r.component.unit}
                    {r.component.costPrice != null && (
                      <> · {fmtGs(Number(r.quantity) * Number(r.component.costPrice))}</>
                    )}
                  </p>
                </div>
                <button
                  title="Quitar de la receta"
                  onClick={() => removeMutation.mutate(r.id)}
                  className="text-muted-foreground/60 transition-colors hover:text-destructive"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border bg-muted/20 px-4 py-3">
            <span className="text-[13px] font-medium text-muted-foreground">
              Costo de materiales por unidad
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {fmtGs(unitCost)}
              {missingCost && (
                <span className="ml-2 text-[11px] font-normal text-warn">
                  (falta cargar algún costo)
                </span>
              )}
            </span>
          </div>
        </>
      )}

      {available.length > 0 && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">Agregar componente</p>
          <div className="flex gap-2">
            <Select
              value={componentId || 'none'}
              onValueChange={(v) => setComponentId(v && v !== 'none' ? v : '')}
            >
              <SelectTrigger className="flex-1">
                <span className="min-w-0 flex-1 truncate text-left text-sm">
                  {available.find((p) => p.id === componentId)?.name ?? 'Seleccionar producto…'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Seleccionar producto…</SelectItem>
                {available.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <NumericInput
              value={quantity}
              onChange={setQuantity}
              decimals={3}
              placeholder="Cantidad"
              className={cn(NUM_CLS, 'w-28')}
            />
          </div>
          {error && <p className="text-[12.5px] text-destructive">{error}</p>}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!componentId || quantity <= 0 || addMutation.isPending}
            onClick={() => { setError(''); addMutation.mutate(); }}
          >
            {addMutation.isPending ? 'Agregando…' : 'Agregar a la receta'}
          </Button>
        </div>
      )}
    </div>
  );
}
