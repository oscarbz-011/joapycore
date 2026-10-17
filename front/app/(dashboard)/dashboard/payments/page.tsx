"use client";

import { paymentMethodLabel } from "@/lib/payment-methods";

import { Fragment, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  CreditCard,
  ChevronRight,
  AlertTriangle,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  paymentsApi,
  type AccountsReceivable,
  type ARStatus,
  type CollectionsSummary,
  type CollectionsRange,
} from "../../../../lib/api/payments";
import { arUrgency, arDisplayDueDate } from "../../../../lib/ar-urgency";
import { formatDatePY } from "../../../../lib/date";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { TablePagination } from "@/components/table-pagination";
import { usePagination } from "@/lib/use-pagination";

import {
  ACCENT_BORDER,
  ACCENT_TEXT,
  ARStatusBadge,
  AR_STATUS_LABELS,
  AR_TYPE_LABELS,
  PENDING_RANGE_LABELS,
  type RowAccent,
  accentFor,
  effectiveAmounts,
  formatPrice,
  invoiceRef,
  productSummary,
  rangeBoundsISO,
} from './_shared';

// ── Collections widget ─────────────────────────────────────────────────────────

const MES_LARGO = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

const RANGE_OPTIONS: { value: CollectionsRange; label: string }[] = [
  { value: "day", label: "Hoy" },
  { value: "week", label: "Esta semana" },
  { value: "month", label: "Este mes" },
];

function CollectionsWidget({
  range,
  onRangeChange,
}: {
  range: CollectionsRange;
  onRangeChange: (r: CollectionsRange) => void;
}) {
  const now = new Date();

  const { data, isLoading } = useQuery<CollectionsSummary>({
    queryKey: ["collections", range],
    queryFn: () => paymentsApi.getCollections(range),
  });

  const rangeLabel =
    range === "day"
      ? "Hoy"
      : range === "week"
        ? "Esta semana"
        : `${MES_LARGO[now.getMonth()]} ${now.getFullYear()}`;
  const totalPct =
    data && data.total > 0
      ? Math.round((data.cash.total / data.total) * 100)
      : 0;
  const methodEntries = data
    ? Object.entries(data.byMethod).sort(([, a], [, b]) => b - a)
    : [];

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
            Recaudaciones
          </p>
          <p className="text-sm text-muted-foreground">{rangeLabel}</p>
        </div>
        {!isLoading && data && (
          <p className="text-xl font-bold text-foreground">
            {formatPrice(data.total)}
          </p>
        )}
        {isLoading && (
          <div className="h-5 w-32 animate-pulse rounded bg-muted/30" />
        )}
      </div>

      <div className="flex gap-1 rounded-full bg-muted/20 p-1 w-fit">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onRangeChange(opt.value)}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              range === opt.value
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {data && data.total > 0 && (
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-muted/20 overflow-hidden flex gap-0.5">
            <div
              className="h-full rounded-l-full bg-emerald-500 transition-all"
              style={{ width: `${totalPct}%` }}
            />
            <div
              className="h-full rounded-r-full bg-violet-500 transition-all"
              style={{ width: `${100 - totalPct}%` }}
            />
          </div>
          <div className="flex gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">Contado</span>
              <span className="font-semibold text-foreground ml-1">
                {formatPrice(data.cash.total)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-violet-500" />
              <span className="text-muted-foreground">Crédito</span>
              <span className="font-semibold text-foreground ml-1">
                {formatPrice(data.credit.total)}
              </span>
            </div>
          </div>
        </div>
      )}

      {methodEntries.length > 0 && (
        <div className="border-t border-border pt-3 space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground/60 uppercase tracking-wider mb-2">
            Por fuente
          </p>
          {methodEntries.map(([method, amount]) => {
            const pct = data!.total > 0 ? (amount / data!.total) * 100 : 0;
            return (
              <div key={method} className="space-y-0.5">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">
                    {method === "UNKNOWN"
                      ? "Sin método"
                      : paymentMethodLabel(method)}
                  </span>
                  <span className="font-medium text-foreground">
                    {formatPrice(amount)}
                  </span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-muted/20">
                  <div
                    className="h-1.5 rounded-full bg-emerald-500 transition-all"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && data && data.total === 0 && (
        <p className="text-center text-xs text-muted-foreground/60 py-2">
          Sin recaudaciones registradas{" "}
          {range === "day"
            ? "hoy"
            : range === "week"
              ? "esta semana"
              : "este mes"}
        </p>
      )}
    </Card>
  );
}

// ── AR row (una factura — se usa sola o como sub-fila de un grupo por cliente) ──

function ARRow({
  ar,
  onClick,
  indent,
}: {
  ar: AccountsReceivable;
  onClick: () => void;
  indent?: boolean;
}) {
  const { isCredit, paid, total, pending } = effectiveAmounts(ar);
  const urgency = arUrgency(ar);
  const accent = accentFor(urgency.level);
  return (
    <tr
      onClick={onClick}
      className="cursor-pointer hover:bg-muted/20 transition-colors"
    >
      <td
        className={cn(
          "px-4 py-3",
          indent && "pl-11",
          accent && cn("border-l-[3px]", ACCENT_BORDER[accent]),
        )}
      >
        <div className="font-medium text-foreground">
          {ar.invoice.saleOrder.customer.firstName}{" "}
          {ar.invoice.saleOrder.customer.lastName}
        </div>
        {ar.invoice.saleOrder.customer.email && (
          <div className="text-xs text-muted-foreground/60">
            {ar.invoice.saleOrder.customer.email}
          </div>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs text-muted-foreground">
          {invoiceRef(ar.invoice)}
        </span>
      </td>
      <td
        className="px-4 py-3 max-w-[14rem] truncate text-muted-foreground"
        title={ar.invoice.items.map((i) => i.description).join(", ")}
      >
        {productSummary(ar.invoice.items)}
      </td>
      <td className="px-4 py-3">
        {isCredit ? (
          <Badge
            variant="outline"
            className="bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-800 gap-1"
          >
            <CreditCard size={10} />
            Crédito
            {ar.invoice.saleOrder.installments
              ? ` · ${ar.invoice.saleOrder.installments}c`
              : ""}
          </Badge>
        ) : (
          <Badge variant="secondary">Contado</Badge>
        )}
      </td>
      <td
        className={cn(
          "px-4 py-3",
          accent ? ACCENT_TEXT[accent] : "text-muted-foreground",
        )}
      >
        {formatDatePY(arDisplayDueDate(ar), "utc")}
      </td>
      <td className="px-4 py-3">
        <ARStatusBadge status={ar.status} urgency={urgency} />
      </td>
      <td className="px-4 py-3 text-right font-mono text-muted-foreground">
        {formatPrice(total)}
      </td>
      <td className="px-4 py-3 text-right font-mono text-emerald-600">
        {formatPrice(paid)}
      </td>
      <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
        {formatPrice(pending)}
      </td>
    </tr>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const arParam = searchParams.get("ar");
  // Los enlaces viejos (?ar=<id>) abrían el panel lateral: ahora van al detalle.
  useEffect(() => {
    if (arParam) router.replace(`/dashboard/payments/${arParam}`);
  }, [arParam, router]);

  const [statusFilter, setStatusFilter] = useState<"" | ARStatus>("");
  const [typeFilter, setTypeFilter] = useState<"" | "CASH" | "CREDIT">("");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<CollectionsRange>("month");
  const [pendingRange, setPendingRange] = useState<CollectionsRange | "all">(
    "all",
  );
  const [expandedCustomers, setExpandedCustomers] = useState<Set<string>>(
    new Set(),
  );

  const { data: arList = [], isLoading } = useQuery({
    queryKey: ["accounts-receivable"],
    queryFn: paymentsApi.listAR,
  });

  // Sin filtro de estado explícito, se ocultan las ya pagadas en su
  // totalidad — no tiene sentido mostrar todas las cuentas por cobrar
  // (activas + saldadas hace tiempo) de entrada; el usuario las ve
  // eligiendo "Pagado" en el filtro a propósito.
  const searchNorm = search.trim().toLowerCase();
  const filtered = arList.filter((ar) => {
    if (statusFilter) {
      if (ar.status !== statusFilter) return false;
    } else if (ar.status === "PAID") {
      return false;
    }
    if (typeFilter && ar.invoice.saleOrder.saleType !== typeFilter)
      return false;
    if (searchNorm) {
      const c = ar.invoice.saleOrder.customer;
      const haystack = [
        c.firstName,
        c.secondFirstName,
        c.lastName,
        c.secondLastName,
        c.email,
        c.documentNumber,
        c.customerCode,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(searchNorm)) return false;
    }
    return true;
  });

  // Agrupa las cuentas por cobrar por cliente — un cliente con varios
  // productos a crédito activos aparece una sola vez, con un dropdown para
  // ver cada producto (y su propio recibo) por separado.
  const groupsByCustomer = new Map<string, AccountsReceivable[]>();
  for (const ar of filtered) {
    const key = ar.invoice.saleOrder.customer.id;
    groupsByCustomer.set(key, [...(groupsByCustomer.get(key) ?? []), ar]);
  }
  const groups = Array.from(groupsByCustomer.values());
  const pagination = usePagination(groups);

  function toggleExpanded(customerId: string) {
    setExpandedCustomers((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  function openPanel(ar: AccountsReceivable) {
    router.push(`/dashboard/payments/${ar.id}`);
  }

  // Vencimiento real de cada cuenta — para crédito, la cuota más próxima sin
  // pagar (arDisplayDueDate ya resuelve esto), no el AR.dueDate estático.
  // Una cuenta sin fecha de vencimiento (ej. contado sin AR.dueDate) no cae
  // en ningún rango puntual — solo se cuenta en "Este mes" como aproximación
  // razonable en vez de desaparecer de todos los rangos. "General" (default)
  // no filtra por fecha — es el monto total adeudado sin importar cuándo vence,
  // pedido aparte por el usuario además del recorte por día/semana/mes.
  const activePendingAR = arList.filter(
    (ar) => ar.status === "PENDING" || ar.status === "PARTIAL",
  );
  const totalPending = (() => {
    if (pendingRange === "all") {
      return activePendingAR.reduce(
        (sum, ar) => sum + effectiveAmounts(ar).pending,
        0,
      );
    }
    const { start, end } = rangeBoundsISO(pendingRange);
    return activePendingAR
      .filter((ar) => {
        const due = arDisplayDueDate(ar);
        if (!due) return pendingRange === "month";
        return due >= start && due < end;
      })
      .reduce((sum, ar) => sum + effectiveAmounts(ar).pending, 0);
  })();

  return (
    <div>
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">
            Cuentas por Cobrar
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cuentas por cobrar y registro de pagos
          </p>
        </div>
        {activePendingAR.length > 0 && (
          <div className="rounded-xl bg-warn-subtle border border-warn px-4 py-2 text-right space-y-1.5">
            <p className="text-xs text-warn font-medium">
              Total pendiente ({PENDING_RANGE_LABELS[pendingRange]})
            </p>
            <p className="text-lg font-bold text-warn">
              {formatPrice(totalPending)}
            </p>
            <div className="flex justify-end gap-0.5">
              {(["day", "week", "month", "all"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPendingRange(v)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium capitalize transition-colors",
                    pendingRange === v
                      ? "bg-card text-warn shadow-sm"
                      : "text-warn/60 hover:text-warn",
                  )}
                >
                  {v === "all" ? "General" : PENDING_RANGE_LABELS[v]}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mb-6">
        <CollectionsWidget range={range} onRangeChange={setRange} />
      </div>

      <div className="mb-4 flex gap-3">
        <Select
          value={statusFilter || "all"}
          onValueChange={(v) =>
            setStatusFilter(v === "all" ? "" : (v as ARStatus))
          }
        >
          <SelectTrigger>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {statusFilter
                ? AR_STATUS_LABELS[statusFilter]
                : "Activas (sin pagadas)"}
            </span>
          </SelectTrigger>
          <SelectContent className="w-auto min-w-[9rem]">
            <SelectItem value="all">Activas (sin pagadas)</SelectItem>
            <SelectItem value="PENDING">Pendiente</SelectItem>
            <SelectItem value="PARTIAL">Parcial</SelectItem>
            <SelectItem value="PAID">Pagado</SelectItem>
            <SelectItem value="CANCELLED">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <div className="relative flex-1 min-w-48 max-w-xs">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
          />
          <Input
            className="pl-8"
            placeholder="Buscar cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={typeFilter || "all"}
          onValueChange={(v) =>
            setTypeFilter(v === "all" ? "" : (v as "CASH" | "CREDIT"))
          }
        >
          <SelectTrigger>
            <span className="min-w-0 flex-1 truncate text-left text-sm">
              {typeFilter ? AR_TYPE_LABELS[typeFilter] : "Contado y crédito"}
            </span>
          </SelectTrigger>
          <SelectContent className="w-auto min-w-[9rem]">
            <SelectItem value="all">Contado y crédito</SelectItem>
            <SelectItem value="CASH">Solo contado</SelectItem>
            <SelectItem value="CREDIT">Solo crédito</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-sm text-muted-foreground/60">
          Cargando cuentas por cobrar...
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground/60">
            {arList.length === 0
              ? "Las cuentas por cobrar se generan automáticamente al emitir una factura."
              : "No se encontraron cuentas con los filtros aplicados."}
          </p>
        </div>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/30 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left">Factura</th>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Tipo</th>
                  <th className="px-4 py-3 text-left">Vencimiento</th>
                  <th className="px-4 py-3 text-left">Estado</th>
                  <th className="px-4 py-3 text-right">Total</th>
                  <th className="px-4 py-3 text-right">Pagado</th>
                  <th className="px-4 py-3 text-right">Pendiente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {pagination.items.map((group) => {
                  if (group.length === 1) {
                    const ar = group[0];
                    return (
                      <ARRow
                        key={ar.id}
                        ar={ar}
                        onClick={() => openPanel(ar)}
                      />
                    );
                  }

                  const customer = group[0].invoice.saleOrder.customer;
                  const isExpanded = expandedCustomers.has(customer.id);
                  const agg = group.reduce(
                    (acc, ar) => {
                      const a = effectiveAmounts(ar);
                      return {
                        paid: acc.paid + a.paid,
                        total: acc.total + a.total,
                        pending: acc.pending + a.pending,
                      };
                    },
                    { paid: 0, total: 0, pending: 0 },
                  );
                  const overdueCount = group.filter(
                    (ar) => arUrgency(ar).level === "overdue",
                  ).length;
                  const pendingCount = group.filter(
                    (ar) => accentFor(arUrgency(ar).level) === "warn",
                  ).length;
                  const groupAccent: RowAccent =
                    overdueCount > 0
                      ? "destructive"
                      : pendingCount > 0
                        ? "warn"
                        : null;

                  return (
                    <Fragment key={customer.id}>
                      <tr
                        onClick={() => toggleExpanded(customer.id)}
                        className="cursor-pointer hover:bg-muted/20 transition-colors bg-muted/10"
                      >
                        <td
                          className={cn(
                            "px-4 py-3",
                            groupAccent &&
                              cn("border-l-[3px]", ACCENT_BORDER[groupAccent]),
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <ChevronRight
                              size={14}
                              className={cn(
                                "shrink-0 text-muted-foreground/60 transition-transform",
                                isExpanded && "rotate-90",
                              )}
                            />
                            <div>
                              <div className="font-medium text-foreground">
                                {customer.firstName} {customer.lastName}
                              </div>
                              {customer.email && (
                                <div className="text-xs text-muted-foreground/60">
                                  {customer.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td
                          className="px-4 py-3 text-xs text-muted-foreground"
                          colSpan={4}
                        >
                          {group.length} productos activos
                          {overdueCount > 0 && (
                            <Badge variant="destructive" className="ml-2 gap-1">
                              <AlertTriangle size={10} />
                              {overdueCount} vencida
                              {overdueCount !== 1 ? "s" : ""}
                            </Badge>
                          )}
                          {pendingCount > 0 && (
                            <Badge
                              variant="outline"
                              className="ml-2 gap-1 bg-warn-subtle text-warn border-warn/30"
                            >
                              {pendingCount} pendiente
                              {pendingCount !== 1 ? "s" : ""}
                            </Badge>
                          )}
                        </td>
                        <td className="px-4 py-3" />
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {formatPrice(agg.total)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">
                          {formatPrice(agg.paid)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
                          {formatPrice(agg.pending)}
                        </td>
                      </tr>
                      {isExpanded &&
                        group.map((ar) => (
                          <ARRow
                            key={ar.id}
                            ar={ar}
                            onClick={() => openPanel(ar)}
                            indent
                          />
                        ))}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <TablePagination
            {...pagination.controls}
            label="clientes"
            className="border-t border-border px-4 py-3"
          />
        </Card>
      )}
    </div>
  );
}
