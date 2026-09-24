"use client";

import { RequirePermission } from "@/components/require-permission";

import { apiErrorMessage } from "@/lib/api/api-error";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import { NumericInput } from "../../../../../components/numeric-input";
import {
  inventoryApi,
  type MovementReason,
  type CreateGlobalMovementPayload,
} from "../../../../../lib/api/inventory";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Constants ──────────────────────────────────────────────────────────────────

const NUM_CLS =
  "h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(iso));
}

function fmtQty(quantity: number) {
  return quantity > 0 ? `+${quantity}` : String(quantity);
}

const REASON_LABELS: Record<MovementReason, string> = {
  PURCHASE: "Ingreso de compra",
  CUSTOMER_RETURN: "Devolución de cliente",
  ADJUSTMENT: "Ajuste de inventario",
  TRANSFER: "Transferencia",
  INITIAL: "Stock inicial",
  SALE_OUT: "Salida por venta",
  SALE_REVERSAL: "Reversión de venta",
  PRODUCTION_IN: "Ingreso por producción",
  PRODUCTION_OUT: "Consumo en producción",
};

const MANUAL_REASONS: MovementReason[] = [
  "PURCHASE",
  "CUSTOMER_RETURN",
  "ADJUSTMENT",
  "TRANSFER",
];

// ── New movement modal ─────────────────────────────────────────────────────────

function NewMovementModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateGlobalMovementPayload>({
    productId: "",
    reason: "PURCHASE",
    quantity: 0,
    direction: "IN",
    warehouseId: undefined,
    toWarehouseId: undefined,
    notes: "",
  });
  const [error, setError] = useState("");

  const { data: products = [] } = useQuery({
    queryKey: ["inventory-products"],
    queryFn: () => inventoryApi.listProductsWithStock({ status: "ACTIVE" }),
  });

  const mutation = useMutation({
    mutationFn: () =>
      inventoryApi.createMovement({
        ...form,
        notes: form.notes || undefined,
        warehouseId: form.warehouseId || undefined,
        toWarehouseId: form.toWarehouseId || undefined,
        direction: form.reason === "ADJUSTMENT" ? form.direction : undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory-movements"] });
      void queryClient.invalidateQueries({ queryKey: ["inventory-products"] });
      onClose();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, "Error al registrar movimiento"));
    },
  });

  const set = <K extends keyof CreateGlobalMovementPayload>(
    k: K,
    v: CreateGlobalMovementPayload[K],
  ) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg rounded-2xl border border-border bg-card shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-sm font-semibold text-foreground">
            Registrar movimiento
          </h2>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onClose}
          >
            <X size={16} />
          </Button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError("");
            mutation.mutate();
          }}
          className="px-6 py-5 space-y-4"
        >
          <div className="space-y-1.5">
            <Label>Producto *</Label>
            <Select
              value={form.productId || "none"}
              onValueChange={(v) =>
                set("productId", v && v !== "none" ? v : "")
              }
            >
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">
                  {products.find((p) => p.id === form.productId)
                    ? `${products.find((p) => p.id === form.productId)!.name}${products.find((p) => p.id === form.productId)!.model ? ` — ${products.find((p) => p.id === form.productId)!.model}` : ""}`
                    : "— Seleccionar —"}
                </span>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Seleccionar —</SelectItem>
                {products
                  .filter((p) => !p.isSerialized)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                      {p.model ? ` — ${p.model}` : ""}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground/60">
              Los productos serializados gestionan el stock por número de serie.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Motivo *</Label>
            <Select
              value={form.reason}
              onValueChange={(v) => v && set("reason", v as MovementReason)}
            >
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">
                  {REASON_LABELS[form.reason as MovementReason] ?? form.reason}
                </span>
              </SelectTrigger>
              <SelectContent>
                {MANUAL_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {REASON_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Cantidad *</Label>
              <NumericInput
                value={form.quantity}
                onChange={(v) => set("quantity", Math.max(1, Math.round(v)))}
                className={NUM_CLS}
                required
              />
            </div>

            {form.reason === "ADJUSTMENT" && (
              <div className="space-y-1.5">
                <Label>Dirección *</Label>
                <div className="flex gap-2">
                  {(["IN", "OUT"] as const).map((d) => (
                    <label
                      key={d}
                      className={cn(
                        "flex-1 flex items-center justify-center rounded-xl border px-3 py-2 text-sm font-medium cursor-pointer transition-colors",
                        form.direction === d
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-border",
                      )}
                    >
                      <input
                        type="radio"
                        className="sr-only"
                        checked={form.direction === d}
                        onChange={() => set("direction", d)}
                      />
                      {d === "IN" ? "+ Agregar" : "− Reducir"}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          {form.reason === "TRANSFER" ? (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Depósito origen</Label>
                <input
                  className={NUM_CLS}
                  placeholder="ID del depósito origen"
                  value={form.warehouseId ?? ""}
                  onChange={(e) =>
                    set("warehouseId", e.target.value || undefined)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Depósito destino *</Label>
                <input
                  className={NUM_CLS}
                  placeholder="ID del depósito destino"
                  value={form.toWarehouseId ?? ""}
                  onChange={(e) =>
                    set("toWarehouseId", e.target.value || undefined)
                  }
                  required
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Depósito (opcional)</Label>
              <input
                className={NUM_CLS}
                placeholder="ID del depósito"
                value={form.warehouseId ?? ""}
                onChange={(e) =>
                  set("warehouseId", e.target.value || undefined)
                }
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Notas (opcional)</Label>
            <input
              className={NUM_CLS}
              placeholder="Ej: recepción factura #001"
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={
                mutation.isPending || !form.productId || form.quantity < 1
              }
            >
              {mutation.isPending ? "Registrando..." : "Registrar"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function MovementsPage() {
  const [showNew, setShowNew] = useState(false);
  const [reasonFilter, setReasonFilter] = useState<MovementReason | "">("");

  const { data: movements = [], isLoading } = useQuery({
    queryKey: ["inventory-movements", reasonFilter],
    queryFn: () =>
      inventoryApi.listMovements({
        reason: reasonFilter || undefined,
        take: 100,
      }),
  });

  return (
    <div>
      <div className="mb-5 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Movimientos
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Historial de movimientos de stock
          </p>
        </div>
        <RequirePermission permission="inventory:movements:create">
          <Button onClick={() => setShowNew(true)}>
            <Plus size={15} />
            Nuevo movimiento
          </Button>
        </RequirePermission>
      </div>

      {/* Filters */}
      <div className="mb-4">
        <Select
          value={reasonFilter || "all"}
          onValueChange={(v) =>
            setReasonFilter(v === "all" ? "" : (v as MovementReason))
          }
        >
          <SelectTrigger className="w-56">
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {reasonFilter
                ? REASON_LABELS[reasonFilter as MovementReason]
                : "Todos los motivos"}
            </span>
          </SelectTrigger>
          <SelectContent className="w-auto min-w-[9rem]">
            <SelectItem value="all">Todos los motivos</SelectItem>
            {(Object.keys(REASON_LABELS) as MovementReason[]).map((r) => (
              <SelectItem key={r} value={r}>
                {REASON_LABELS[r]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">
          Cargando movimientos...
        </div>
      ) : movements.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground/60">
            No hay movimientos registrados.
          </p>
          <RequirePermission permission="inventory:movements:create">
            <button
              onClick={() => setShowNew(true)}
              className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
            >
              Registrar el primero
            </button>
          </RequirePermission>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Producto
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Motivo
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Cantidad
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Depósito
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                    Notas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {movements.map((m) => (
                  <tr
                    key={m.id}
                    className="hover:bg-muted/20 transition-colors"
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                      {fmtDate(m.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">
                        {m.product.name}
                      </p>
                      {m.product.model && (
                        <p className="font-mono text-xs text-muted-foreground/60">
                          {m.product.model}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-muted/30 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        {m.reason ? REASON_LABELS[m.reason] : m.type}
                      </span>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 text-right font-mono font-bold tabular-nums",
                        m.quantity > 0
                          ? "text-emerald-600"
                          : "text-destructive",
                      )}
                    >
                      {fmtQty(m.quantity)}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {m.warehouse?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                      {m.notes ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew && <NewMovementModal onClose={() => setShowNew(false)} />}
    </div>
  );
}
