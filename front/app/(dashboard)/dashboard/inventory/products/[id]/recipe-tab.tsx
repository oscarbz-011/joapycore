'use client';

import { apiErrorMessage } from '@/lib/api/api-error';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Hammer, Pencil, Trash2, X } from 'lucide-react';
import { NumericInput } from '../../../../../../components/numeric-input';
import { inventoryApi } from '../../../../../../lib/api/inventory';
import { productionApi } from '../../../../../../lib/api/production';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { usePermission } from '@/lib/permissions';
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
  const canManage = usePermission('production:recipes:manage');
  const queryClient = useQueryClient();
  const [componentId, setComponentId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [error, setError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editQty, setEditQty] = useState(0);
  const [editError, setEditError] = useState('');

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
    onError: (err) => setError(apiErrorMessage(err, 'No se pudo agregar el componente')),
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; quantity: number }) =>
      productionApi.updateComponent(productId, vars.id, { quantity: vars.quantity }),
    onSuccess: () => {
      setEditingId(null);
      setEditError('');
      invalidate();
    },
    onError: (err) => setEditError(apiErrorMessage(err, 'No se pudo actualizar la cantidad')),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => productionApi.removeComponent(productId, id),
    onSuccess: invalidate,
  });

  const startEdit = (id: string, current: number) => {
    setEditingId(id);
    setEditQty(current);
    setEditError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError('');
  };

  const saveEdit = (id: string, current: number) => {
    // El backend valida @IsPositive(): cortamos antes de gastar un request.
    if (editQty <= 0) {
      setEditError('La cantidad tiene que ser mayor a cero');
      return;
    }
    if (editQty === current) {
      cancelEdit();
      return;
    }
    updateMutation.mutate({ id, quantity: editQty });
  };

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
            {recipe.map((r) => {
              const current = Number(r.quantity);
              const editing = editingId === r.id;
              return (
                <div key={r.id} className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{r.component.name}</p>
                    {editing ? (
                      <div className="mt-1 flex items-center gap-1.5">
                        <NumericInput
                          value={editQty}
                          onChange={setEditQty}
                          decimals={3}
                          autoFocus
                          disabled={updateMutation.isPending}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(r.id, current);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className={cn(NUM_CLS, 'h-8 w-24')}
                        />
                        <span className="text-xs text-muted-foreground">{r.component.unit}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Guardar cantidad"
                          disabled={updateMutation.isPending}
                          onClick={() => saveEdit(r.id, current)}
                        >
                          <Check size={14} />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          title="Cancelar"
                          disabled={updateMutation.isPending}
                          onClick={cancelEdit}
                        >
                          <X size={14} />
                        </Button>
                      </div>
                    ) : (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          title="Editar cantidad"
                          disabled={!canManage}
                          onClick={() => startEdit(r.id, current)}
                          className="-ml-2.5 font-normal text-muted-foreground"
                        >
                          {fmtQty(current)} {r.component.unit}
                          <Pencil size={10} className="opacity-0 transition-opacity group-hover:opacity-60" />
                        </Button>
                        {r.component.costPrice != null && (
                          <>· {fmtGs(current * Number(r.component.costPrice))}</>
                        )}
                      </p>
                    )}
                    {editing && editError && (
                      <p className="mt-1 text-[12.5px] text-destructive">{editError}</p>
                    )}
                  </div>
                  {canManage && !editing && (
                    <button
                      title="Quitar de la receta"
                      onClick={() => removeMutation.mutate(r.id)}
                      className="text-muted-foreground/60 transition-colors hover:text-destructive"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              );
            })}
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

      {canManage && available.length > 0 && (
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
