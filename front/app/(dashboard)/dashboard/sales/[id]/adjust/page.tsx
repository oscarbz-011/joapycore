"use client";

import { resolveWarehouseId, warehouseChoices } from '@/lib/sale-warehouse';
import { useSaleStock } from '@/lib/use-sale-stock';
import { apiErrorMessage } from "@/lib/api/api-error";
import { findStockIssues } from "@/lib/sales-stock";
import { salesChannelProductFilters } from "@/lib/product-catalog";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Plus, Send, UserPlus } from "lucide-react";
import {
  salesApi,
  type CreateSaleOrderItem,
} from "../../../../../../lib/api/sales";
import { inventoryApi } from "../../../../../../lib/api/inventory";
import { settingsApi } from "../../../../../../lib/api/settings";
import { useAuth } from "../../../../../../lib/auth-context";
import { formatDatePY } from "../../../../../../lib/date";
import {
  formatPrice,
  type LineItem,
  LineItemRow,
  CreditOptions,
} from "../../../../../../components/sales/order-line-items";
import { Button } from "@/components/ui/button";

const ADJUSTMENT_LABELS: Record<string, string> = {
  LOWER_VALUE_PRODUCT: "Ofrecer un producto de menor valor",
  MORE_INSTALLMENTS: "Aumentar la cantidad de cuotas",
  ADD_GUARANTOR: "Agregar uno o más garantes",
};

export default function AdjustOrderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { jwtPayload } = useAuth();
  const canAdjust = jwtPayload?.permissions.includes("sales:update") ?? false;

  const { data: order, isLoading } = useQuery({
    queryKey: ["sale-order", id],
    queryFn: () => salesApi.getOrder(id),
  });
  const { data: products = [] } = useQuery({
    queryKey: ["inventory-products-active-with-stock"],
    queryFn: () =>
      inventoryApi.listProductsWithStock(salesChannelProductFilters("NORMAL")),
  });
  const { data: creditConfig } = useQuery({
    queryKey: ["credit-config"],
    queryFn: settingsApi.getCredit,
  });
  const activePlans = creditConfig?.isEnabled
    ? (creditConfig.plans ?? []).filter((p) => p.isActive)
    : [];

  const [items, setItems] = useState<LineItem[]>([]);
  const [installments, setInstallments] = useState(0);
  // Hidrata el formulario una sola vez, cuando el pedido y el catálogo de
  // productos ya llegaron — actualizar estado durante el render (no en un
  // efecto) evita el doble render de "cargar y después hidratar" para este
  // caso de "derivar estado inicial desde props/queries que llegan async".
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  if (order && products.length > 0 && hydratedFor !== order.id) {
    setItems(
      order.items
        .filter((i) => i.productId)
        .map((i) => ({
          productId: i.productId!,
          product: products.find((p) => p.id === i.productId) ?? null,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          serialInput: i.productUnits.map((u) => u.serialNumber).join("\n"),
          warehouseId: i.warehouseId ?? undefined,
        })),
    );
    setInstallments(order.installments ?? activePlans[0]?.installments ?? 0);
    setHydratedFor(order.id);
  }

  const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);

  const stock = useSaleStock();

  const saveMutation = useMutation({
    mutationFn: () => {
      const dto: { items?: CreateSaleOrderItem[]; installments?: number } = {
        items: items.map(
          (it): CreateSaleOrderItem => ({
            productId: it.productId,
            quantity: Number(it.quantity),
            unitPrice: Number(it.unitPrice),
            warehouseId:
              resolveWarehouseId(
                it.warehouseId,
                warehouseChoices(stock, it.productId),
                Number(it.quantity),
              ) || undefined,
            serialNumbers: it.product?.isSerialized
              ? it.serialInput
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean)
              : undefined,
          }),
        ),
        installments: installments || undefined,
      };
      return salesApi.adjustOrder(id, dto);
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["sale-order", id], updated);
      void queryClient.invalidateQueries({ queryKey: ["sale-orders"] });
    },
  });

  const resubmitMutation = useMutation({
    mutationFn: () => salesApi.resubmitOrder(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sale-orders"] });
      router.push("/dashboard/sales");
    },
  });

  function updateItem(index: number, updated: LineItem) {
    setItems((prev) => prev.map((it, i) => (i === index ? updated : it)));
  }
  function removeItem(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }
  function addItem() {
    setItems((prev) => [
      ...prev,
      {
        productId: "",
        product: null,
        quantity: 1,
        unitPrice: 0,
        serialInput: "",
      },
    ]);
  }

  const stockIssues = findStockIssues(items, products);
  const canSave =
    items.length > 0 &&
    items.every((it) => it.productId && it.quantity > 0) &&
    stockIssues.length === 0;

  if (isLoading) {
    return (
      <div className="py-24 text-center text-sm text-muted-foreground/60">
        Cargando pedido...
      </div>
    );
  }
  if (!order) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">
          No se encontró el pedido.
        </p>
        <button
          onClick={() => router.push("/dashboard/sales")}
          className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
        >
          Volver
        </button>
      </div>
    );
  }
  if (!canAdjust) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">
          No tenés permisos para ajustar pedidos.
        </p>
      </div>
    );
  }
  if (order.status !== "CREDIT_NEEDS_ADJUSTMENT") {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">
          Este pedido no está esperando ajustes.
        </p>
        <button
          onClick={() => router.push("/dashboard/sales")}
          className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
        >
          Volver a Ventas
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <button
        type="button"
        onClick={() => router.push("/dashboard/sales")}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} />
        Ventas
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">
          Ajustar pedido
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {order.customer.firstName} {order.customer.lastName}
        </p>
      </div>

      <div className="rounded-2xl border border-amber-300/50 bg-amber-50 dark:bg-amber-950/30 px-5 py-4 mb-6 space-y-1.5">
        <p className="text-sm font-medium text-amber-700 dark:text-amber-300">
          El analista pidió ajustes en este pedido
        </p>
        {order.suggestedAlternatives.length > 0 && (
          <ul className="text-xs text-amber-700/90 dark:text-amber-300/90 list-disc list-inside">
            {order.suggestedAlternatives.map((alt) => (
              <li key={alt}>{ADJUSTMENT_LABELS[alt] ?? alt}</li>
            ))}
          </ul>
        )}
        {order.adjustmentNote && (
          <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
            {order.adjustmentNote}
          </p>
        )}
      </div>

      {/* Items */}
      <div className="rounded-2xl border border-border bg-card mb-6">
        <div className="border-b border-border px-5 py-3 flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Productos
          </p>
          <Button type="button" size="sm" variant="outline" onClick={addItem}>
            <Plus size={14} />
            Agregar línea
          </Button>
        </div>
        <div className="px-5 py-4 space-y-2">
          {items.map((item, index) => (
            <LineItemRow
              key={index}
              item={item}
              products={products}
              stock={stock}
              onChange={(updated) => updateItem(index, updated)}
              onRemove={() => removeItem(index)}
            />
          ))}
          <div className="flex justify-between items-center border-t border-border mt-3 pt-3">
            <span className="text-sm font-semibold text-muted-foreground">
              Total
            </span>
            <span className="text-base font-bold text-foreground">
              {formatPrice(total)}
            </span>
          </div>
        </div>
      </div>

      {/* Financing plan */}
      {order.saleType === "CREDIT" && (
        <div className="mb-6">
          <CreditOptions
            total={total}
            installments={installments}
            onInstallmentsChange={setInstallments}
            plans={activePlans}
          />
        </div>
      )}

      {saveMutation.isError && (
        <p className="mb-3 text-xs text-destructive">
          {apiErrorMessage(saveMutation.error, "Error al guardar los cambios")}
        </p>
      )}
      {saveMutation.isSuccess && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={13} />
          Cambios guardados
        </p>
      )}

      <Button
        className="w-full mb-3"
        disabled={!canSave || saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? "Guardando..." : "Guardar cambios"}
      </Button>

      {/* Guarantors */}
      <div className="rounded-2xl border border-border bg-card mb-6">
        <div className="border-b border-border px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Garantes
          </p>
        </div>
        <div className="px-5 py-4 space-y-3">
          {order.guarantors.length > 0 && (
            <div className="space-y-2">
              {order.guarantors.map((g) => (
                <div key={g.id} className="text-sm">
                  <p className="text-foreground">
                    {g.firstName} {g.lastName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {g.documentType}: {g.documentNumber}
                    {g.phone ? ` · ${g.phone}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() =>
              router.push(`/dashboard/sales/${order.id}/adjust/guarantor`)
            }
          >
            <UserPlus size={14} />
            Agregar garante
          </Button>
        </div>
      </div>

      {resubmitMutation.isError && (
        <p className="mb-3 text-xs text-destructive">
          {apiErrorMessage(
            resubmitMutation.error,
            "Error al reenviar a evaluación",
          )}
        </p>
      )}

      <Button
        className="w-full bg-emerald-600 hover:bg-emerald-700"
        disabled={resubmitMutation.isPending}
        onClick={() => resubmitMutation.mutate()}
      >
        <Send size={15} />
        {resubmitMutation.isPending ? "Reenviando..." : "Reenviar a evaluación"}
      </Button>
      <p className="mt-2 text-xs text-muted-foreground text-center">
        {formatDatePY(order.orderDate, "local")}
      </p>
    </div>
  );
}
