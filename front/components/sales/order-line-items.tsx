"use client";

import { AlertTriangle, Trash2 } from "lucide-react";
import { NumericInput } from "../numeric-input";
import { SearchSelect } from "../../app/(dashboard)/dashboard/components/search-select";
import { type ProductWithStock, type StockResult } from "../../lib/api/inventory";
import {
  resolveWarehouseId,
  unassignedStock,
  warehouseChoices,
} from "../../lib/sale-warehouse";
import { type CreditPlan } from "../../lib/api/settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ── Compartido entre "Nuevo pedido" (sales/page.tsx) y "Ajustar pedido"
// (sales/[id]/adjust/page.tsx) — mismo editor de líneas de producto y mismo
// selector de plan de cuotas en los dos lugares donde un pedido a crédito
// se arma o se corrige.

export function formatPrice(n: number) {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
  }).format(n);
}

export const NUM_CLS =
  "h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

export interface LineItem {
  productId: string;
  product: ProductWithStock | null;
  quantity: number;
  unitPrice: number;
  serialInput: string;
  // Depósito elegido a mano; vacío = el sugerido según el stock.
  warehouseId?: string;
  // Presentes solo cuando la línea salió de un combo — comboGroupId agrupa
  // todas las líneas del mismo combo agregado (para mostrarlas juntas y
  // poder quitarlas de una vez), comboId es la trazabilidad hacia el combo,
  // comboName es solo para mostrar el label del grupo sin depender de que
  // el combo siga existiendo/cargado en el momento de renderizar.
  comboGroupId?: string;
  comboId?: string;
  comboName?: string;
}

export function LineItemRow({
  item,
  products,
  stock,
  onChange,
  onRemove,
}: {
  item: LineItem;
  products: ProductWithStock[];
  // Stock por depósito (useSaleStock) para elegir de dónde sale el ítem.
  stock?: StockResult;
  onChange: (updated: LineItem) => void;
  onRemove: () => void;
}) {
  const subtotal = item.quantity * item.unitPrice;
  const choices = warehouseChoices(stock, item.productId);
  const warehouseId = resolveWarehouseId(
    item.warehouseId,
    choices,
    item.quantity,
  );
  const warehouse = choices.find((choice) => choice.id === warehouseId);
  const unassigned = unassignedStock(stock, item.productId);
  // Con el desglose por depósito, lo que importa es el stock del depósito
  // elegido; sin él (todavía cargando) se compara contra el total.
  const available = warehouse
    ? warehouse.quantity
    : Number(item.product?.stock ?? 0);
  const insufficientStock = item.product !== null && item.quantity > available;
  return (
    <div
      className={cn(
        "rounded-2xl border border-border p-3 space-y-2",
        insufficientStock && "border-destructive/50 bg-destructive/5",
      )}
    >
      <div className="flex gap-2 items-start">
        <div className="flex-1">
          <SearchSelect<ProductWithStock>
            items={products}
            value={item.productId}
            onChange={(id, product) =>
              onChange({
                ...item,
                productId: id,
                product,
                unitPrice: product ? Number(product.salePrice) : 0,
                serialInput: "",
                warehouseId: undefined,
              })
            }
            getKey={(p) => p.id}
            getLabel={(p) => `${p.name}${p.model ? ` (${p.model})` : ""}`}
            getDescription={(p) =>
              `${p.category?.name ?? "Sin categoría"} · Stock disponible: ${p.stock}`
            }
            filterFn={(p, q) =>
              `${p.name} ${p.model ?? ""} ${p.category?.name ?? ""}`
                .toLowerCase()
                .includes(q.toLowerCase())
            }
            placeholder="Buscar producto..."
            required
          />
        </div>
        <div className="w-20">
          <NumericInput
            value={item.quantity}
            onChange={(v) =>
              onChange({ ...item, quantity: Math.max(1, Math.round(v)) })
            }
            placeholder="Cant."
            className={NUM_CLS}
            required
          />
        </div>
        <div className="w-32">
          <NumericInput
            value={item.unitPrice}
            onChange={(v) => onChange({ ...item, unitPrice: v })}
            placeholder="Precio"
            className={NUM_CLS}
            required
          />
        </div>
        <div className="w-28 pt-2 text-right text-sm font-medium text-muted-foreground">
          {formatPrice(subtotal)}
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="pt-2 text-muted-foreground/50 hover:text-destructive"
        >
          <Trash2 size={15} />
        </button>
      </div>
      {item.product && choices.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Label className="text-xs text-muted-foreground">Sale de</Label>
          <Select
            value={warehouseId || "none"}
            onValueChange={(value) =>
              onChange({
                ...item,
                warehouseId: value && value !== "none" ? value : undefined,
              })
            }
          >
            <SelectTrigger size="sm" className="w-64">
              <span className="min-w-0 flex-1 truncate text-left text-xs">
                {warehouse
                  ? `${warehouse.name} · ${warehouse.quantity} disp.`
                  : "— Seleccionar depósito —"}
              </span>
            </SelectTrigger>
            <SelectContent>
              {choices.map((choice) => (
                <SelectItem key={choice.id} value={choice.id}>
                  {choice.name} · {choice.quantity} disp.
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      {item.product && stock && choices.length === 0 && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertTriangle size={13} />
          No hay depósitos activos. Creá uno en Ajustes para poder vender.
        </div>
      )}
      {insufficientStock && (
        <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
          <AlertTriangle size={13} />
          Stock insuficiente{warehouse ? ` en ${warehouse.name}` : ""}:
          disponible {available}, solicitado {item.quantity}.
          {unassigned > 0 &&
            ` Hay ${unassigned} sin depósito asignado: asignalo desde Inventario → Movimientos.`}
        </div>
      )}
      {item.product?.isSerialized && (
        <div>
          <Label className="mb-1 text-xs">
            Números de serie (uno por línea, {item.quantity} requerido
            {item.quantity !== 1 ? "s" : ""})
          </Label>
          <Textarea
            className="font-mono text-xs"
            rows={Math.min(item.quantity, 4)}
            placeholder={"SN001\nSN002"}
            value={item.serialInput}
            onChange={(e) => onChange({ ...item, serialInput: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ── Credit plan selector ───────────────────────────────────────────────────────

export function CreditOptions({
  total,
  installments,
  onInstallmentsChange,
  plans,
}: {
  total: number;
  installments: number;
  onInstallmentsChange: (n: number) => void;
  plans: CreditPlan[];
}) {
  const selectedPlan = plans.find((p) => p.installments === installments);
  const rate = selectedPlan ? Number(selectedPlan.interestRate) : 0;
  const monthly =
    installments > 0 ? (total * (1 + rate / 100)) / installments : 0;

  return (
    <div className="rounded-2xl border border-warn/30 bg-warn-subtle/50 p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-warn">
        Venta a crédito
      </p>
      <div>
        <Label className="mb-1 text-xs">Plan de cuotas</Label>
        <div className="flex gap-2 flex-wrap">
          {plans.map((plan) => (
            <Button
              key={plan.installments}
              type="button"
              size="sm"
              variant={
                installments === plan.installments ? "default" : "outline"
              }
              onClick={() => onInstallmentsChange(plan.installments)}
            >
              {plan.installments}x
            </Button>
          ))}
        </div>
      </div>
      {installments > 0 && total > 0 && selectedPlan && (
        <p className="text-sm text-warn">
          Cuota estimada: <strong>{formatPrice(Math.ceil(monthly))}</strong> /
          mes
          {rate > 0 && (
            <span className="text-xs ml-1 opacity-70">
              ({rate}% interés total)
            </span>
          )}
        </p>
      )}
      <p className="text-xs text-warn/80">
        El pedido quedará en estado <strong>En evaluación</strong> hasta que el
        analista de crédito lo apruebe.
      </p>
    </div>
  );
}
