'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { apiErrorMessage } from '@/lib/api/api-error';
import { inventoryApi } from '@/lib/api/inventory';
import {
  UNLOCATED_SOURCE,
  buildTransferRequest,
  transferDestinations,
  transferSources,
  type TransferRequest,
} from '@/lib/inventory-transfer';

const NUM_CLS =
  'h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30';

interface StockTransferDialogProps {
  onClose: () => void;
}

/**
 * Traslada stock entre depósitos sin cambiar el total. El origen "Sin depósito
 * asignado" regulariza la existencia histórica que no tiene ubicación.
 */
export function StockTransferDialog({ onClose }: StockTransferDialogProps) {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState('');
  const [fromId, setFromId] = useState('');
  const [toWarehouseId, setToWarehouseId] = useState('');
  const [quantity, setQuantity] = useState(0);
  // null = el usuario todavía no tocó la lista: se usa la selección por defecto.
  const [pickedSerials, setPickedSerials] = useState<string[] | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const { data: products = [], isLoading: loadingProducts } = useQuery({
    queryKey: ['inventory-products'],
    queryFn: () => inventoryApi.listProducts({ status: 'ACTIVE' }),
  });
  const product = products.find((item) => item.id === productId) ?? null;
  const isSerialized = product?.isSerialized ?? false;

  const {
    data: stock,
    isLoading: loadingStock,
    isError: stockFailed,
  } = useQuery({
    queryKey: ['inventory-stock', 'product', productId],
    queryFn: () => inventoryApi.getStock({ productId }),
    enabled: Boolean(productId),
  });
  const { data: units = [] } = useQuery({
    queryKey: ['inventory-product-units', productId],
    queryFn: () => inventoryApi.getProductUnits(productId),
    enabled: Boolean(productId) && isSerialized,
  });

  const row = stock?.items[0] ?? null;
  const sources = transferSources(row);
  const source = sources.find((item) => item.id === fromId) ?? null;
  const available = source?.quantity ?? 0;
  const destinations = transferDestinations(stock?.warehouses ?? [], fromId);
  const destination =
    destinations.find((warehouse) => warehouse.id === toWarehouseId) ?? null;
  const fromUnlocated = fromId === UNLOCATED_SOURCE;

  const candidateSerials = units
    .filter(
      (unit) =>
        unit.status === 'IN_STOCK' &&
        (fromUnlocated ? unit.warehouseId === null : unit.warehouseId === fromId),
    )
    .map((unit) => unit.serialNumber);
  const serialNumbers = (
    pickedSerials ?? (fromUnlocated ? candidateSerials : [])
  ).filter((serial) => candidateSerials.includes(serial));

  const mutation = useMutation({
    mutationFn: (request: TransferRequest) =>
      request.kind === 'assign'
        ? inventoryApi.assignUnlocatedStock(request.payload)
        : inventoryApi.createMovement(request.payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['inventory-stock'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      void queryClient.invalidateQueries({
        queryKey: ['inventory-product-units', productId],
      });
      void queryClient.invalidateQueries({
        queryKey: ['inventory-product-movements', productId],
      });
      onClose();
    },
    onError: (err) =>
      setError(apiErrorMessage(err, 'No se pudo registrar el traslado')),
  });

  const submit = () => {
    setError('');
    let request: TransferRequest;
    try {
      request = buildTransferRequest(
        {
          productId,
          isSerialized,
          fromId,
          toWarehouseId,
          quantity,
          serialNumbers,
          notes,
        },
        available,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revisá los datos');
      return;
    }
    mutation.mutate(request);
  };

  const selectProduct = (value: string) => {
    setProductId(value);
    setFromId('');
    setToWarehouseId('');
    setQuantity(0);
    setPickedSerials(null);
    setError('');
  };

  const selectSource = (value: string) => {
    const next = sources.find((item) => item.id === value);
    setFromId(value);
    if (value === toWarehouseId) setToWarehouseId('');
    // Regularizar suele ser "todo lo que quedó sin ubicar": se propone el saldo.
    setQuantity(value === UNLOCATED_SOURCE && next ? Math.abs(next.quantity) : 0);
    setPickedSerials(null);
    setError('');
  };

  const toggleSerial = (serial: string, checked: boolean) =>
    setPickedSerials(
      checked
        ? [...new Set([...serialNumbers, serial])]
        : serialNumbers.filter((item) => item !== serial),
    );

  const nothingToMove =
    Boolean(productId) && !loadingStock && !stockFailed && sources.length === 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trasladar stock</DialogTitle>
          <DialogDescription>
            Mueve existencias de un depósito a otro. El total del producto no
            cambia.
          </DialogDescription>
        </DialogHeader>

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label>Producto *</Label>
            <Select
              value={productId || 'none'}
              onValueChange={(value) =>
                selectProduct(value && value !== 'none' ? value : '')
              }
            >
              <SelectTrigger className="w-full">
                <span className="min-w-0 flex-1 truncate text-left text-sm">
                  {product
                    ? `${product.name}${product.model ? ` — ${product.model}` : ''}`
                    : loadingProducts
                      ? 'Cargando productos...'
                      : '— Seleccionar —'}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Seleccionar —</SelectItem>
                {products.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name}
                    {item.model ? ` — ${item.model}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {productId && loadingStock && (
            <p className="text-sm text-muted-foreground">
              Cargando existencias...
            </p>
          )}
          {stockFailed && (
            <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              No se pudieron cargar las existencias del producto.
            </p>
          )}
          {nothingToMove && (
            <p className="rounded-xl border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              Este producto no tiene stock para trasladar.
            </p>
          )}

          {sources.length > 0 && (
            <>
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-3">
                <div className="space-y-1.5">
                  <Label>Origen *</Label>
                  <Select
                    value={fromId || 'none'}
                    onValueChange={(value) =>
                      selectSource(value && value !== 'none' ? value : '')
                    }
                  >
                    <SelectTrigger className="w-full">
                      <span className="min-w-0 flex-1 truncate text-left text-sm">
                        {source
                          ? `${source.label} (${source.quantity})`
                          : '— Seleccionar —'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Seleccionar —</SelectItem>
                      {sources.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label} ({item.quantity})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ArrowRight
                  size={16}
                  aria-hidden
                  className="mb-2.5 text-muted-foreground"
                />
                <div className="space-y-1.5">
                  <Label>Destino *</Label>
                  <Select
                    value={toWarehouseId || 'none'}
                    disabled={!fromId}
                    onValueChange={(value) =>
                      setToWarehouseId(value && value !== 'none' ? value : '')
                    }
                  >
                    <SelectTrigger className="w-full">
                      <span className="min-w-0 flex-1 truncate text-left text-sm">
                        {destination?.name ?? '— Seleccionar —'}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— Seleccionar —</SelectItem>
                      {destinations.map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {fromId && destinations.length === 0 && (
                <p className="rounded-xl border border-warn/30 bg-warn-subtle px-3 py-2 text-xs text-warn">
                  No hay otro depósito activo al que trasladar.
                </p>
              )}

              {fromUnlocated && available < 0 && (
                <p className="rounded-xl border border-warn/30 bg-warn-subtle px-3 py-2 text-xs text-warn">
                  El saldo sin depósito es negativo: son salidas históricas sin
                  ubicación. Al asignarlas se descuentan del depósito destino,
                  que debe tener existencia suficiente.
                </p>
              )}

              {source && !isSerialized && (
                <div className="space-y-1.5">
                  <Label htmlFor="transfer-quantity">Cantidad *</Label>
                  <NumericInput
                    id="transfer-quantity"
                    value={quantity}
                    onChange={(value) =>
                      setQuantity(Math.max(0, Math.round(value)))
                    }
                    className={NUM_CLS}
                  />
                  <p className="text-xs text-muted-foreground">
                    Hasta {Math.abs(available)} {product?.unit ?? ''}
                  </p>
                </div>
              )}

              {source && isSerialized && (
                <div className="space-y-1.5">
                  <Label>
                    Números de serie * ({serialNumbers.length} de{' '}
                    {candidateSerials.length})
                  </Label>
                  {candidateSerials.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay unidades en stock en este origen.
                    </p>
                  ) : (
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-2xl bg-input/30 p-2">
                      {candidateSerials.map((serial) => (
                        <label
                          key={serial}
                          className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 font-mono text-sm hover:bg-muted/40"
                        >
                          <Checkbox
                            checked={serialNumbers.includes(serial)}
                            onCheckedChange={(checked) =>
                              toggleSerial(serial, checked === true)
                            }
                          />
                          {serial}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="transfer-notes">Notas (opcional)</Label>
                <Input
                  id="transfer-notes"
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Ej: reposición de sucursal"
                />
              </div>
            </>
          )}

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !fromId || !toWarehouseId}
            >
              {mutation.isPending ? 'Trasladando...' : 'Trasladar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
