"use client";

import { apiErrorMessage } from "@/lib/api/api-error";

import { Fragment, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { NumericInput } from "../../../../components/numeric-input";
import {
  X,
  Printer,
  FileText,
  AlertTriangle,
  Clock,
} from "lucide-react";
import {
  paymentsApi,
  PAYMENT_METHOD_LABELS,
  type AccountsReceivable,
  type ARStatus,
  type PaymentMethod,
  type RegisterPaymentPayload,
  type CollectionsRange,
} from "../../../../lib/api/payments";
import { financeApi, type Installment, type InstallmentStatus } from "../../../../lib/api/finance";
import { billingApi, type InvoiceStatus } from "../../../../lib/api/billing";
import { openPdf } from "../../../../lib/open-pdf";
import { type DistributedItem } from "../../../../lib/finance-distribute";
import { DUE_SOON_DAYS, type ArUrgency, type ArUrgencyLevel } from "../../../../lib/ar-urgency";
import { daysOverdue } from "../../../../lib/overdue";
import { formatDatePY, todayISODate, toISODate } from "../../../../lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// ── Constants ──────────────────────────────────────────────────────────────────

export const NUM_CLS =
  "h-9 w-full min-w-0 rounded-3xl border border-transparent bg-input/50 px-3 text-sm outline-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

export const AR_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
  CANCELLED: "Cancelado",
};
export const AR_TYPE_LABELS: Record<string, string> = {
  CASH: "Solo contado",
  CREDIT: "Solo crédito",
};
export const PENDING_RANGE_LABELS: Record<CollectionsRange | "all", string> = {
  day: "hoy",
  week: "esta semana",
  month: "este mes",
  all: "general",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

export function formatPrice(n: number) {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
  }).format(n);
}

export function invoiceRef(ar: AccountsReceivable["invoice"]) {
  if (ar.invoiceNumber) return `${ar.invoicePrefix ?? ""}${ar.invoiceNumber}`;
  return `#${ar.id.slice(0, 8).toUpperCase()}`;
}

// "Ventilador" / "Ventilador +2 más" — para no romper el ancho de la fila
// con facturas de muchos ítems distintos.
export function productSummary(items: AccountsReceivable["invoice"]["items"]): string {
  if (items.length === 0) return "—";
  const [first, ...rest] = items;
  return rest.length === 0
    ? first.description
    : `${first.description} +${rest.length} más`;
}

// Para crédito, el saldo real vive en las cuotas del préstamo (pueden
// diferir del AR si hubo reprogramaciones) — para contado, el AR es la
// única fuente. Mismo cálculo que antes vivía duplicado dentro de la
// tabla y en el total pendiente del header.
export function effectiveAmounts(ar: AccountsReceivable) {
  const isCredit = ar.invoice.saleOrder.saleType === "CREDIT";
  const loan = ar.invoice.saleOrder.loan;
  const paid =
    isCredit && loan
      ? loan.installments.reduce((s, i) => s + Number(i.paidAmount), 0)
      : Number(ar.paidAmount);
  const total = isCredit && loan ? Number(loan.totalAmount) : Number(ar.amount);
  return { isCredit, paid, total, pending: total - paid };
}

// [start, end) del rango elegido, como fechas ISO — mismo criterio día/semana
// (lunes a domingo)/mes que ya usa el backend en PaymentsService.getCollections(),
// pero acá alcanza con los componentes locales del navegador (se asume que
// quien mira la pantalla está en Paraguay, a diferencia del backend, que
// corre en un servidor de timezone desconocida y necesita anclar a
// America/Asuncion explícito).
export function rangeBoundsISO(range: CollectionsRange): {
  start: string;
  end: string;
} {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const iso = (year: number, month: number, day: number) =>
    toISODate(new Date(Date.UTC(year, month, day)));

  if (range === "day") return { start: iso(y, m, d), end: iso(y, m, d + 1) };
  if (range === "week") {
    const dow = now.getDay();
    const diffToMonday = dow === 0 ? 6 : dow - 1;
    const startDate = new Date(y, m, d - diffToMonday);
    return {
      start: iso(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate(),
      ),
      end: iso(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate() + 7,
      ),
    };
  }
  return { start: iso(y, m, 1), end: iso(y, m + 1, 1) };
}

// Mismo diseño de resaltado (barra izquierda + fecha coloreada) para
// "Vencida"/"Vence en N días" (rojo/ámbar) y "Pendiente" al contado (ámbar)
// — "Parcial"/"Pagado"/"Cancelado" no llevan acento, ya se distinguen bien
// solo con el badge de estado. Ver front/lib/ar-urgency.ts para el porqué
// crédito y contado se calculan distinto.
export type RowAccent = "destructive" | "warn" | null;

export function accentFor(level: ArUrgencyLevel): RowAccent {
  if (level === "overdue") return "destructive";
  if (level === "due-soon" || level === "pending") return "warn";
  return null;
}

export const ACCENT_BORDER: Record<Exclude<RowAccent, null>, string> = {
  destructive: "border-l-destructive",
  warn: "border-l-warn",
};

export const ACCENT_TEXT: Record<Exclude<RowAccent, null>, string> = {
  destructive: "font-medium text-destructive",
  warn: "font-medium text-warn",
};

// ── Status badges ──────────────────────────────────────────────────────────────

export const AR_STATUS_LABEL: Record<ARStatus, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagado",
  CANCELLED: "Cancelado",
};

export const AR_STATUS_CLASS: Partial<Record<ARStatus, string>> = {
  PENDING: "bg-warn-subtle text-warn border-warn/30",
  PARTIAL:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  PAID: "bg-accent-subtle text-accent-on border-accent-on/20",
};

export function ARStatusBadge({
  status,
  urgency,
}: {
  status: ARStatus;
  urgency?: ArUrgency;
}) {
  if (urgency?.level === "overdue") {
    return (
      <Badge variant="destructive" className="gap-1 whitespace-nowrap">
        <AlertTriangle size={10} />
        Vencida · {urgency.days} {urgency.days === 1 ? "día" : "días"}
      </Badge>
    );
  }
  if (urgency?.level === "due-soon") {
    return (
      <Badge
        variant="outline"
        className="gap-1 whitespace-nowrap bg-warn-subtle text-warn border-warn/30"
      >
        <Clock size={10} />
        Cuota {urgency.installmentNumber} vence en {urgency.days}{" "}
        {urgency.days === 1 ? "día" : "días"}
      </Badge>
    );
  }
  return (
    <Badge
      variant={status === "CANCELLED" ? "destructive" : "outline"}
      className={AR_STATUS_CLASS[status]}
    >
      {AR_STATUS_LABEL[status]}
    </Badge>
  );
}

export const INV_STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: "Borrador",
  ISSUED: "Emitida",
  PAID: "Pagada",
  CANCELLED: "Cancelada",
};

export const INV_STATUS_CLASS: Partial<Record<InvoiceStatus, string>> = {
  PENDING: "bg-warn-subtle text-warn border-warn/30",
  ISSUED:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  PAID: "bg-accent-subtle text-accent-on border-accent-on/20",
};

export function InvStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge
      variant={status === "CANCELLED" ? "destructive" : "outline"}
      className={INV_STATUS_CLASS[status]}
    >
      {INV_STATUS_LABEL[status]}
    </Badge>
  );
}

export const INST_STATUS_LABEL: Record<InstallmentStatus, string> = {
  PENDING: "Pendiente",
  PARTIAL: "Parcial",
  PAID: "Pagada",
  OVERDUE: "Vencida",
};

export const INST_STATUS_CLASS: Partial<Record<InstallmentStatus, string>> = {
  // "Pendiente" sin apuro queda deliberadamente neutro (gris) — no hay
  // necesidad de resaltar una cuota que recién vence dentro de varios meses,
  // solo la que está vencida o por vencer (ver installmentUrgency abajo).
  PENDING: "bg-muted/30 text-muted-foreground border-border",
  PARTIAL:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  PAID: "bg-accent-subtle text-accent-on border-accent-on/20",
};

// Mismo criterio que arUrgency() (ver ar-urgency.ts): calcula "vencida"/"por
// vencer" sobre la fecha real de la cuota, no sobre `status`, que solo lo
// actualiza el cron nocturno — una cuota recién vencida (o cualquier corrida
// antes de medianoche) puede seguir en PENDING en la base.
export function installmentUrgency(inst: Installment): {
  level: ArUrgencyLevel;
  days: number;
} {
  if (inst.status === "PAID") return { level: null, days: 0 };
  const overdueDays = daysOverdue(inst.dueDate);
  if (overdueDays > 0) return { level: "overdue", days: overdueDays };
  const daysUntil = -overdueDays;
  if (daysUntil <= DUE_SOON_DAYS) return { level: "due-soon", days: daysUntil };
  return { level: null, days: 0 };
}

export function InstallmentStatusBadge({
  status,
  urgency,
}: {
  status: InstallmentStatus;
  urgency: { level: ArUrgencyLevel; days: number };
}) {
  if (urgency.level === "overdue") {
    return (
      <Badge variant="destructive" className="gap-1 whitespace-nowrap">
        <AlertTriangle size={10} />
        Vencida · {urgency.days} {urgency.days === 1 ? "día" : "días"}
      </Badge>
    );
  }
  if (urgency.level === "due-soon") {
    return (
      <Badge
        variant="outline"
        className="gap-1 whitespace-nowrap bg-warn-subtle text-warn border-warn/30"
      >
        <Clock size={10} />
        Vence en {urgency.days} {urgency.days === 1 ? "día" : "días"}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={INST_STATUS_CLASS[status]}>
      {INST_STATUS_LABEL[status]}
    </Badge>
  );
}

// ── Invoice detail modal ───────────────────────────────────────────────────────

export function InvoiceDetailModal({
  invoiceId,
  open,
  onOpenChange,
}: {
  invoiceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: invoice, isLoading } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => billingApi.getInvoice(invoiceId),
    enabled: open,
  });

  const customer = invoice?.saleOrder.customer;
  const ref = invoice
    ? invoice.invoiceNumber
      ? `${invoice.invoicePrefix ?? ""}${invoice.invoiceNumber}`
      : `#${invoice.id.slice(0, 8).toUpperCase()}`
    : "…";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 p-0 overflow-hidden sm:max-w-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div className="flex items-center gap-3">
            <FileText size={18} className="text-muted-foreground/60" />
            <div>
              <DialogTitle className="text-base font-semibold">
                Factura {ref}
              </DialogTitle>
              {invoice && (
                <p className="text-xs text-muted-foreground/60 mt-0.5">
                  Emitida:{" "}
                  {formatDatePY(invoice.issuedAt ?? invoice.createdAt, "local")}
                </p>
              )}
            </div>
            {invoice && <InvStatusBadge status={invoice.status} />}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onOpenChange(false)}
          >
            <X size={18} />
          </Button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-5 max-h-[calc(90vh-130px)]">
          {isLoading && (
            <p className="py-10 text-center text-sm text-muted-foreground/60">
              Cargando factura…
            </p>
          )}

          {invoice && (
            <>
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-muted/30 px-4 py-3 text-sm">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">
                    Cliente
                  </p>
                  <p className="font-semibold text-foreground">
                    {customer?.firstName} {customer?.lastName}
                  </p>
                  {customer?.email && (
                    <p className="text-muted-foreground text-xs">
                      {customer.email}
                    </p>
                  )}
                  {customer?.documentNumber && (
                    <p className="text-muted-foreground text-xs">
                      {customer.documentType ?? "CI"}: {customer.documentNumber}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60 mb-1">
                    Tipo de venta
                  </p>
                  <p className="text-foreground">
                    {invoice.saleOrder.saleType === "CREDIT"
                      ? `Crédito${invoice.saleOrder.installments ? ` · ${invoice.saleOrder.installments} cuotas` : ""}`
                      : "Contado"}
                  </p>
                  {invoice.dueDate && (
                    <p className="text-muted-foreground text-xs mt-1">
                      Venc.: {formatDatePY(invoice.dueDate, "utc")}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                  Detalle de productos
                </p>
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-sm">
                    <thead className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2.5 text-left">Descripción</th>
                        <th className="px-4 py-2.5 text-center">Cant.</th>
                        <th className="px-4 py-2.5 text-right">Precio unit.</th>
                        <th className="px-4 py-2.5 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {invoice.items.map((item) => (
                        <tr key={item.id} className="hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-muted-foreground">
                            {item.description}
                          </td>
                          <td className="px-4 py-2.5 text-center text-muted-foreground">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-muted-foreground">
                            {formatPrice(Number(item.unitPrice))}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono font-medium text-foreground">
                            {formatPrice(Number(item.total))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-foreground">
                        <td
                          colSpan={3}
                          className="px-4 py-3 text-right text-sm font-semibold text-muted-foreground"
                        >
                          TOTAL
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-base font-bold text-foreground">
                          {formatPrice(Number(invoice.total))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {invoice.notes && (
                <div className="rounded-xl bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
                  <span className="font-medium">Notas: </span>
                  {invoice.notes}
                </div>
              )}
            </>
          )}
        </div>

        {invoice && (
          <div className="border-t border-border px-6 py-4 flex justify-between items-center shrink-0">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            <Button
              disabled={!invoice.pdfFileId}
              onClick={() =>
                invoice.pdfFileId && void openPdf(invoice.pdfFileId)
              }
            >
              <Printer size={15} />
              {invoice.pdfFileId ? "Imprimir factura" : "PDF no disponible"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Register payment modal ─────────────────────────────────────────────────────

export function RegisterPaymentModal({
  ar,
  open,
  onOpenChange,
  onSaved,
}: {
  ar: AccountsReceivable;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const remaining = Number(ar.amount) - Number(ar.paidAmount);

  const [amount, setAmount] = useState<number>(Math.round(remaining));
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [date, setDate] = useState(todayISODate());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      const dto: RegisterPaymentPayload = {
        amount,
        paymentMethod: method,
        paymentDate: date,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      return paymentsApi.registerPayment(ar.id, dto);
    },
    onSuccess: () => {
      onSaved();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, "Error al registrar el pago"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 p-0 overflow-hidden sm:max-w-md"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <DialogTitle className="text-base font-semibold">
              Registrar cobro
            </DialogTitle>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {ar.invoice.saleOrder.customer.firstName}{" "}
              {ar.invoice.saleOrder.customer.lastName}
              {" · "}Saldo: {formatPrice(remaining)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onOpenChange(false)}
          >
            <X size={18} />
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
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Monto (PYG) *</Label>
              <NumericInput
                value={amount}
                onChange={setAmount}
                className={NUM_CLS}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha *</Label>
              <DatePicker value={date} onChange={setDate} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Método de pago *</Label>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as PaymentMethod)}
            >
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">
                  {PAYMENT_METHOD_LABELS[method]}
                </span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
                  (key) => (
                    <SelectItem key={key} value={key}>
                      {PAYMENT_METHOD_LABELS[key]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Referencia / Comprobante</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="N° transferencia, cheque..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Registrando..." : "Confirmar cobro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Pay installments modal (selección múltiple, un solo recibo) ────────────────

export function PayInstallmentsModal({
  loanId,
  saleOrderId,
  items,
  open,
  onOpenChange,
  onSaved,
}: {
  loanId: string;
  saleOrderId: string;
  items: DistributedItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const queryClient = useQueryClient();
  const totalAmount = items.reduce((s, i) => s + i.amount, 0);

  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [date, setDate] = useState(todayISODate());
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      financeApi.payInstallments(loanId, {
        items: items.map((i) => ({
          installmentId: i.installmentId,
          amount: i.amount,
        })),
        paymentMethod: method,
        paymentReference: reference.trim() || undefined,
        paymentDate: date,
        notes: notes.trim() || undefined,
      }),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
      void queryClient.invalidateQueries({
        queryKey: ["loan-by-order", saleOrderId],
      });
      if (data.receipt?.pdfFileId) void openPdf(data.receipt.pdfFileId);
      onSaved();
    },
    onError: (err: Error) => {
      setError(apiErrorMessage(err, "Error al registrar el cobro"));
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex flex-col gap-0 p-0 overflow-hidden sm:max-w-md"
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4 shrink-0">
          <div>
            <DialogTitle className="text-base font-semibold">
              Cobrar {items.length} cuota{items.length !== 1 ? "s" : ""}
            </DialogTitle>
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              Total: {formatPrice(totalAmount)}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onOpenChange(false)}
          >
            <X size={18} />
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
          <div className="rounded-lg bg-muted/30 px-3 py-2 space-y-1">
            {items.map((i) => (
              <div
                key={i.installmentId}
                className="flex justify-between text-xs"
              >
                <span className="text-muted-foreground">
                  Cuota #{i.number}
                  {!i.isFull && " (parcial)"}
                </span>
                <span className="font-medium text-foreground">
                  {formatPrice(i.amount)}
                </span>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Fecha *</Label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div className="space-y-1.5">
            <Label>Método de pago *</Label>
            <Select
              value={method}
              onValueChange={(v) => setMethod(v as PaymentMethod)}
            >
              <SelectTrigger className="w-full">
                <span className="flex-1 text-left text-sm truncate">
                  {PAYMENT_METHOD_LABELS[method]}
                </span>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map(
                  (key) => (
                    <SelectItem key={key} value={key}>
                      {PAYMENT_METHOD_LABELS[key]}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Referencia / Comprobante</Label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="N° recibo, transferencia..."
            />
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Registrando..." : "Confirmar cobro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
