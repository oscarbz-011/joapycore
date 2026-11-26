"use client";

import { useQuery } from "@tanstack/react-query";
import { NumericInput } from "@/components/numeric-input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { inventoryApi, type ProductPresentation } from "@/lib/api/inventory";
import {
  cutUnitPrice,
  DIMENSION_LABEL,
  factorFromDimensions,
  factorText,
  measureOf,
  type Dimension,
} from "@/lib/dimensions";
import { unitSymbol } from "@/lib/units-of-measure";

/** En qué se vende la línea: la unidad del producto, una presentación o un corte. */
export interface SaleUnitValue {
  presentationId?: string;
  cut?: Partial<Record<Dimension, number>>;
}

export interface SaleUnitChange {
  /** Precio sugerido para la nueva forma de venta; undefined = dejar el actual. */
  unitPrice?: number;
  /** Cuánto de la unidad del producto lleva una unidad vendida (null = falta medir). */
  factor: number | null;
  /** Nombre para mostrar en el carrito ("Plancha entera", "corte"). */
  label: string | null;
}

export interface SaleUnitProduct {
  id: string;
  unitCode: number;
  salePrice: number | string | null;
  isSerialized: boolean;
}

const BASE = "base";
const CUT = "cut";

export function presentationsQueryKey(productId: string) {
  return ["product-presentations", productId] as const;
}

/**
 * Selector "Se vende por" de una línea de venta. No muestra nada si la
 * empresa no vende en presentaciones o el producto no tiene otra forma de
 * venderse.
 */
export function SaleUnitPicker({
  product,
  value,
  onChange,
  enabled,
  compact = false,
}: {
  product: SaleUnitProduct | null;
  value: SaleUnitValue;
  onChange: (value: SaleUnitValue, change: SaleUnitChange) => void;
  enabled: boolean;
  compact?: boolean;
}) {
  const active = enabled && !!product && !product.isSerialized;
  const { data: presentations = [] } = useQuery({
    queryKey: presentationsQueryKey(product?.id ?? ""),
    queryFn: () => inventoryApi.getPresentations(product!.id),
    enabled: active,
    staleTime: 60_000,
  });
  if (!active || !product) return null;

  const measure = measureOf(product.unitCode);
  const offered = presentations.filter(
    (p) => p.isActive || p.id === value.presentationId,
  );
  if (offered.length === 0 && !measure) return null;

  const selected = value.cut
    ? CUT
    : (value.presentationId ?? BASE);
  const presentation = offered.find((p) => p.id === value.presentationId);
  const baseSymbol = unitSymbol(product.unitCode);
  const basePrice = Number(product.salePrice ?? 0);

  const choose = (choice: string) => {
    if (choice === BASE) {
      onChange({}, { unitPrice: basePrice, factor: 1, label: null });
      return;
    }
    if (choice === CUT) {
      onChange({ cut: {} }, { factor: null, label: "corte" });
      return;
    }
    const chosen = offered.find((p) => p.id === choice);
    if (!chosen) return;
    onChange(
      { presentationId: chosen.id },
      { unitPrice: chosen.salePrice, factor: chosen.factor, label: chosen.name },
    );
  };

  const setDimension = (dimension: Dimension, size: number) => {
    const cut = { ...value.cut, [dimension]: size > 0 ? size : undefined };
    const factor = factorFromDimensions(product.unitCode, cut);
    onChange(
      { cut },
      {
        unitPrice: factor ? cutUnitPrice(basePrice, factor) : undefined,
        factor: factor ? factor.toNumber() : null,
        label: "corte",
      },
    );
  };

  const cutFactor = value.cut
    ? factorFromDimensions(product.unitCode, value.cut)
    : null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-1">
        {!compact && (
          <Label className="text-xs text-muted-foreground">Se vende por</Label>
        )}
        <Select value={selected} onValueChange={(v) => v && choose(v)}>
          <SelectTrigger
            size="sm"
            className="w-56"
            aria-label="Se vende por"
          >
            <span className="min-w-0 flex-1 truncate text-left text-xs">
              {selected === CUT
                ? "Corte a medida"
                : presentation
                  ? presentation.name
                  : `Por ${baseSymbol}`}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BASE}>Por {baseSymbol}</SelectItem>
            {offered.map((p: ProductPresentation) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name} · {factorText(p.factor, product.unitCode)}
              </SelectItem>
            ))}
            {measure && <SelectItem value={CUT}>Corte a medida</SelectItem>}
          </SelectContent>
        </Select>
      </div>

      {value.cut &&
        measure?.dimensions.map((dimension) => (
          <div key={dimension} className="w-24 space-y-1">
            <Label
              htmlFor={`cut-${product.id}-${dimension}`}
              className="text-xs text-muted-foreground"
            >
              {DIMENSION_LABEL[dimension]} ({measure.linearSymbol})
            </Label>
            <NumericInput
              id={`cut-${product.id}-${dimension}`}
              value={value.cut?.[dimension] ?? 0}
              onChange={(v) => setDimension(dimension, v)}
              decimals={3}
              className="h-8 w-full rounded-lg border border-border bg-background px-2 text-right text-sm"
            />
          </div>
        ))}

      <p className="pb-1.5 text-xs text-muted-foreground">
        {presentation &&
          `${factorText(presentation.factor, product.unitCode)} c/u`}
        {value.cut &&
          (cutFactor
            ? `${factorText(cutFactor.toString(), product.unitCode)} por pieza`
            : "Cargá las medidas de cada pieza")}
      </p>
    </div>
  );
}
