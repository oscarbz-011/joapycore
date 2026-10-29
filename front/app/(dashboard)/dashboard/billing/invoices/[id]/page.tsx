"use client";

import { RequirePermission } from "@/components/require-permission";
import { EntityTimeline } from "@/components/communications/entity-timeline";
import { SeriesNumberingFields } from "@/components/billing/series-numbering-fields";
import { PreprintedSheetPanel } from "@/components/billing/preprinted-sheet-panel";
import { printPreprintedForm } from "@/lib/preprinted-form";
import {
  invoiceDetailLines,
  invoiceIvaSummary,
  ivaRateLabel,
} from "@/lib/invoice-detail";
import {
  defaultSeriesId,
  documentNumberError,
  MODALITY_LABELS,
  needsDocumentNumber,
  usableOptions,
} from "@/lib/billing-series";

import { apiErrorMessage } from "@/lib/api/api-error";

import { useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Printer,
  RotateCw,
  Send,
  AlertTriangle,
} from "lucide-react";
import {
  billingApi,
  invoicePdfAction,
  type InvoiceStatus,
  type IssueInvoicePayload,
  type PaymentMethod,
} from "../../../../../../lib/api/billing";
import { settingsApi } from "../../../../../../lib/api/settings";
import { openPdf } from "../../../../../../lib/open-pdf";
import {
  formatDatePY,
  parseISODate,
  toISODate,
} from "../../../../../../lib/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatPrice(n: number) {
  return new Intl.NumberFormat("es-PY", {
    style: "currency",
    currency: "PYG",
    maximumFractionDigits: 0,
  }).format(n);
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PENDING: "Borrador",
  ISSUED: "Emitida",
  PAID: "Pagada",
  CANCELLED: "Cancelada",
};

const STATUS_CLASS: Partial<Record<InvoiceStatus, string>> = {
  PENDING: "bg-warn-subtle text-warn border-warn/30",
  ISSUED:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
  PAID: "bg-accent-subtle text-accent-on border-accent-on/20",
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge
      variant={status === "CANCELLED" ? "destructive" : "outline"}
      className={STATUS_CLASS[status]}
    >
      {STATUS_LABEL[status]}
    </Badge>
  );
}

// ── Row helper ─────────────────────────────────────────────────────────────────

// Espeja BACK/src/modules/finance/services/loans.service.ts:computeFirstDueDate
// — mismo algoritmo exacto (UTC, garantiza al menos un mes de plazo antes del
// primer vencimiento). Si se toca uno, tocar el otro. La versión anterior acá
// usaba fecha local con la condición invertida (nunca daba 2 meses de salto),
// por eso una venta cargada el 01/09 con corte día 5 vencía el 05/09 (4 días
// de plazo) en vez del 05/10.
function computeFirstDueDateISO(dueDayOfMonth: number): string {
  const today = new Date();
  const monthsAhead = today.getUTCDate() > dueDayOfMonth ? 2 : 1;
  return toISODate(
    new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth() + monthsAhead,
        dueDayOfMonth,
      ),
    ),
  );
}

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Efectivo",
  BANK_TRANSFER: "Transferencia bancaria",
  CARD: "Tarjeta (débito/crédito)",
  PAGO_EXPRESS: "PagoExpress",
  AQUI_PAGO: "AquíPago",
  CHECK: "Cheque",
};

const TEXTAREA_CLS =
  "w-full min-w-0 rounded-2xl border border-transparent bg-input/50 px-3 py-2 text-sm outline-none resize-none transition-[color,box-shadow,background-color] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30";

const SECTION_LABEL =
  "text-xs font-semibold uppercase tracking-wider text-muted-foreground/60";

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-2 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="min-w-0 wrap-break-word text-sm font-medium text-foreground text-right">
        {value}
      </span>
    </div>
  );
}

function DataGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-5 py-4">
      <h2 className={`${SECTION_LABEL} mb-1`}>{title}</h2>
      {children}
    </div>
  );
}

function KeyFact({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="bg-card px-5 py-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={`mt-1 truncate text-foreground tabular-nums ${strong ? "text-lg font-bold" : "text-sm font-medium"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums text-foreground">{formatPrice(value)}</dd>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data: invoice,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["invoice", id],
    queryFn: () => billingApi.getInvoice(id),
  });

  const { data: creditConfig } = useQuery({
    queryKey: ["credit-config"],
    queryFn: settingsApi.getCredit,
  });
  const dueDayOfMonth = creditConfig?.dueDayOfMonth ?? 5;

  const [form, setForm] = useState<IssueInvoicePayload>({
    paymentCondition: "CASH",
    dueDate: "",
    paymentMethod: undefined,
    notes: "",
  });
  const [formReady, setFormReady] = useState(false);
  // Día del mes elegido para el vencimiento de la 1ª cuota — no una fecha de
  // calendario arbitraria, es "qué día de cada mes" (mismo concepto que
  // CreditConfig.dueDayOfMonth, capado 1-28). form.dueDate es la fecha
  // concreta ya resuelta que se manda al backend.
  const [selectedDay, setSelectedDay] = useState<number>(dueDayOfMonth);

  // Inicialización única cuando llega la factura. Se hace durante el render
  // (patrón "ajustar estado a partir de props" de React) y no en un efecto,
  // para no pintar un render con el formulario vacío y re-renderizar.
  if (invoice && !formReady) {
    const isCredit = invoice.saleOrder.saleType === "CREDIT";
    setForm({
      paymentCondition: isCredit ? "CREDIT" : "CASH",
      dueDate: isCredit
        ? invoice.dueDate
          ? invoice.dueDate.slice(0, 10)
          : computeFirstDueDateISO(dueDayOfMonth)
        : "",
      paymentMethod: invoice.paymentMethod ?? undefined,
      notes: invoice.notes ?? "",
    });
    if (isCredit) {
      setSelectedDay(
        invoice.dueDate
          ? (parseISODate(invoice.dueDate)?.getUTCDate() ?? dueDayOfMonth)
          : dueDayOfMonth,
      );
    }
    setFormReady(true);
  }

  // Solo recalcula la fecha concreta cuando el usuario cambia el día — si ya
  // había un dueDate real guardado y no lo tocó, se manda tal cual (recalcular
  // con "hoy" como ancla podría dar un mes distinto al que ya está guardado).
  function handleDayChange(day: number) {
    setSelectedDay(day);
    setForm((f) => ({ ...f, dueDate: computeFirstDueDateISO(day) }));
  }

  const [showCancelForm, setShowCancelForm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [chosenSeriesId, setChosenSeriesId] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");

  // Un intento anterior pudo haber reservado el número: ya no se elige serie.
  const needsSeries =
    invoice?.status === "PENDING" && invoice.sequential == null;
  const { data: seriesOptions = [], isLoading: loadingSeries } = useQuery({
    queryKey: ["invoice", id, "series-options"],
    queryFn: () => billingApi.getSeriesOptions(id),
    enabled: needsSeries,
  });
  const seriesId = chosenSeriesId || defaultSeriesId(seriesOptions);
  const selectedSeries = usableOptions(seriesOptions).find(
    (o) => o.id === seriesId,
  );
  const numberError = needsDocumentNumber(selectedSeries)
    ? documentNumberError(documentNumber, selectedSeries)
    : null;
  const seriesReady = !needsSeries || (!!selectedSeries && !numberError);

  const issueMutation = useMutation({
    // Si ya no hay conexión, debe fallar y ofrecer reintento explícito en
    // vez de dejar la emisión pausada para ejecutarse sola al reconectar.
    networkMode: "always",
    mutationFn: () =>
      billingApi.issueInvoice(id, {
        paymentCondition: form.paymentCondition,
        dueDate: form.dueDate || undefined,
        paymentMethod: form.paymentMethod,
        notes: form.notes || undefined,
        ...(needsSeries
          ? {
              seriesId: seriesId || undefined,
              ...(needsDocumentNumber(selectedSeries)
                ? { documentNumber: Number(documentNumber) }
                : {}),
            }
          : {}),
      }),
    // Con talonario se imprime sobre la hoja apenas queda emitida.
    onSuccess: (issued) => {
      if (issued.modality !== "PREPRINTED") return;
      void billingApi
        .printInvoiceForm(issued.id)
        .then(({ receipt }) => {
          if (receipt.formLayout) printPreprintedForm(receipt, receipt.formLayout);
        })
        .catch(() => undefined);
    },
    // También se reconcilia después de un error: el POST pudo haber llegado
    // al backend y haberse perdido únicamente la respuesta. Al reconectar,
    // React Query vuelve a consultar y muestra el estado persistido real.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const retryPdfMutation = useMutation({
    networkMode: "always",
    mutationFn: () => billingApi.retryInvoicePdf(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => billingApi.cancelInvoice(id, cancelReason),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["invoice", id] });
      void queryClient.invalidateQueries({ queryKey: ["invoices"] });
      void queryClient.invalidateQueries({ queryKey: ["credit-notes"] });
      setShowCancelForm(false);
    },
  });

  if (isLoading) {
    return (
      <div className="py-24 text-center text-sm text-muted-foreground/60">
        Cargando factura...
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted-foreground/60">
          No se encontró la factura.
        </p>
        <button
          onClick={() => router.back()}
          className="mt-3 text-sm font-medium text-foreground underline underline-offset-2"
        >
          Volver
        </button>
      </div>
    );
  }

  const isPending = invoice.status === "PENDING";
  const canCancel = invoice.status === "PENDING" || invoice.status === "ISSUED";
  const customer = invoice.saleOrder.customer;
  const invoiceRef = invoice.invoiceNumber
    ? `${invoice.invoicePrefix ?? ""}${invoice.invoiceNumber}`
    : `#${invoice.id.slice(0, 8).toUpperCase()}`;
  const isCredit = invoice.saleOrder.saleType === "CREDIT";
  const canIssue =
    (isCredit ? !!form.dueDate : !!form.paymentMethod) && seriesReady;
  const pdfAction = invoicePdfAction(invoice);
  // Talonario de imprenta: la factura es la hoja preimpresa, sin PDF.
  const issuesOnSheet = needsSeries
    ? selectedSeries?.modality === "PREPRINTED"
    : invoice.modality === "PREPRINTED";
  const onSheet =
    invoice.modality === "PREPRINTED" &&
    invoice.sequential != null &&
    (invoice.status === "ISSUED" || invoice.status === "PAID");

  const customerName = `${customer.firstName} ${customer.lastName}`.trim();
  const lines = invoiceDetailLines(invoice.items, Number(invoice.total), isCredit);
  const iva = invoiceIvaSummary(lines);
  const conditionLabel = isCredit
    ? `Crédito${invoice.saleOrder.installments ? ` · ${invoice.saleOrder.installments} cuotas` : ""}`
    : "Contado";
  const subtotals = [
    { label: "Exentas", value: iva.exempt },
    { label: "Gravadas 5%", value: iva.taxed5 },
    { label: "Gravadas 10%", value: iva.taxed10 },
  ].filter((s) => s.value > 0);
  const ivaRows = [
    { label: "IVA 5%", value: iva.iva5 },
    { label: "IVA 10%", value: iva.iva10 },
  ].filter((s) => s.value > 0);

  return (
    <div className="w-full">
      {/* Back */}
      <button
        type="button"
        onClick={() => router.push("/dashboard/billing")}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={15} />
        Facturas
      </button>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-foreground">
              {invoice.invoiceNumber ? (
                <>
                  Factura <span className="font-mono">{invoiceRef}</span>
                </>
              ) : (
                "Borrador de factura"
              )}
            </h1>
            <StatusBadge status={invoice.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {customerName}
            {invoice.modality && <> · {MODALITY_LABELS[invoice.modality]}</>}
          </p>
        </div>
        {pdfAction === "print" ? (
          <Button
            variant="outline"
            onClick={() => void openPdf(invoice.pdfFileId!)}
          >
            <Printer size={15} />
            Imprimir / descargar PDF
          </Button>
        ) : pdfAction === "retry" ? (
          <RequirePermission permission="billing:issue">
            <div className="flex flex-col items-end gap-1">
              <Button
                variant="outline"
                disabled={retryPdfMutation.isPending}
                onClick={() => retryPdfMutation.mutate()}
              >
                <RotateCw
                  size={15}
                  className={retryPdfMutation.isPending ? "animate-spin" : ""}
                />
                {retryPdfMutation.isPending ? "Regenerando..." : "Regenerar PDF"}
              </Button>
              {retryPdfMutation.isError && (
                <p role="alert" className="text-xs text-destructive">
                  {apiErrorMessage(
                    retryPdfMutation.error,
                    "No se pudo regenerar el PDF",
                  )}
                </p>
              )}
            </div>
          </RequirePermission>
        ) : null}
      </div>

      {/* Key facts */}
      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
        <KeyFact label="Total" value={formatPrice(Number(invoice.total))} strong />
        <KeyFact label="Condición" value={conditionLabel} />
        <KeyFact
          label="Emitida"
          value={invoice.issuedAt ? formatDatePY(invoice.issuedAt, "local") : "Sin emitir"}
        />
        {isCredit ? (
          <KeyFact
            label="Vence la 1ª cuota"
            value={invoice.dueDate ? formatDatePY(invoice.dueDate, "utc") : "—"}
          />
        ) : (
          <KeyFact
            label="Método de pago"
            value={invoice.paymentMethod ? PAYMENT_METHOD_LABELS[invoice.paymentMethod] : "—"}
          />
        )}
      </dl>

      {/* Main grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* LEFT: detail + communications */}
        <div className="min-w-0 space-y-6">
          <section className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className={SECTION_LABEL}>Detalle</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/30 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  <tr>
                    <th className="px-5 py-3 text-left">Descripción</th>
                    <th className="w-20 px-5 py-3 text-right">Cant.</th>
                    {!isCredit && <th className="px-5 py-3 text-right">P. Unit.</th>}
                    <th className="w-24 px-5 py-3 text-right">IVA</th>
                    <th className="px-5 py-3 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line) => (
                    <tr key={line.id}>
                      <td className="px-5 py-3 font-medium text-foreground">{line.description}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{line.quantity}</td>
                      {!isCredit && (
                        <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">
                          {formatPrice(line.unitPrice)}
                        </td>
                      )}
                      <td className="px-5 py-3 text-right text-muted-foreground">{ivaRateLabel(line.ivaRate)}</td>
                      <td className="px-5 py-3 text-right font-medium tabular-nums text-foreground">
                        {formatPrice(line.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid gap-6 border-t border-border bg-muted/20 px-5 py-4 sm:grid-cols-2">
              <dl className="space-y-1.5 text-sm">
                <dt className={`${SECTION_LABEL} mb-2`}>Liquidación del IVA</dt>
                {subtotals.map((s) => (
                  <TotalRow key={s.label} label={s.label} value={s.value} />
                ))}
                {ivaRows.map((s) => (
                  <TotalRow key={s.label} label={s.label} value={s.value} />
                ))}
                <TotalRow label="Total IVA" value={iva.ivaTotal} />
              </dl>
              <div className="flex flex-col justify-end sm:items-end">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  Total a pagar
                </span>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {formatPrice(Number(invoice.total))}
                </span>
              </div>
            </div>
          </section>

          <EntityTimeline
            entityType="INVOICE"
            entityId={invoice.id}
            recipient={customer.email}
            canSendInvoice={
              Boolean(invoice.pdfFileId) &&
              (invoice.status === "ISSUED" || invoice.status === "PAID")
            }
          />
        </div>

        {/* RIGHT: actions + data */}
        <div className="space-y-6">
          {isPending && (
            <section className="rounded-xl border border-border bg-card p-5">
              <h2 className={`${SECTION_LABEL} mb-4`}>Emisión</h2>

              {/* Payment condition — read-only */}
              <div className="mb-4 space-y-1.5">
                <Label>Condición de venta</Label>
                <div className="flex items-center gap-2 h-9 rounded-3xl border border-border bg-muted/30 px-3 text-sm cursor-default select-none">
                  <Badge
                    variant="outline"
                    className={
                      isCredit
                        ? "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800"
                        : "bg-accent-subtle text-accent-on border-accent-on/20"
                    }
                  >
                    {isCredit ? "Crédito" : "Contado"}
                  </Badge>
                  {isCredit && invoice.saleOrder.installments && (
                    <span className="text-xs text-muted-foreground/60">
                      {invoice.saleOrder.installments} cuotas
                    </span>
                  )}
                </div>
              </div>

              {/* Due date — credit only */}
              {isCredit && (
                <div className="mb-4 space-y-1.5">
                  <Label htmlFor="due-date">
                    Fecha de vencimiento de la 1ª cuota *
                    <span className="ml-1 font-normal text-muted-foreground/60">
                      (por conv. día {dueDayOfMonth} de cada mes)
                    </span>
                  </Label>
                  <Select
                    value={String(selectedDay)}
                    onValueChange={(v) => v && handleDayChange(Number(v))}
                  >
                    <SelectTrigger id="due-date" className="w-full">
                      <span className="min-w-0 flex-1 truncate text-left text-sm">
                        Día {selectedDay}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(
                        (day) => (
                          <SelectItem key={day} value={String(day)}>
                            Día {day}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground/60">
                    Vence el {formatDatePY(form.dueDate, "utc")}. Si la cambiás,
                    se reprograma todo el cronograma de cuotas a partir de esta
                    fecha.
                  </p>
                </div>
              )}

              {/* Payment method — cash only */}
              {!isCredit && (
                <div className="mb-4 space-y-1.5">
                  <Label htmlFor="payment-method">Método de pago *</Label>
                  <Select
                    value={form.paymentMethod || "none"}
                    onValueChange={(v) =>
                      setForm((f) => ({
                        ...f,
                        paymentMethod:
                          v === "none" ? undefined : (v as PaymentMethod),
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <span className="flex-1 text-left text-sm truncate">
                        {form.paymentMethod
                          ? PAYMENT_METHOD_LABELS[form.paymentMethod]
                          : "Seleccionar método..."}
                      </span>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Seleccionar método...
                      </SelectItem>
                      {(
                        Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]
                      ).map((m) => (
                        <SelectItem key={m} value={m}>
                          {PAYMENT_METHOD_LABELS[m]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="mb-4">
                {needsSeries ? (
                  <SeriesNumberingFields
                    options={seriesOptions}
                    isLoading={loadingSeries}
                    seriesId={seriesId}
                    onSeriesChange={setChosenSeriesId}
                    documentNumber={documentNumber}
                    onDocumentNumberChange={setDocumentNumber}
                    documentNumberError={documentNumber ? numberError : null}
                    disabled={issueMutation.isPending}
                  />
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Número reservado:{" "}
                    <span className="font-mono text-foreground">{invoiceRef}</span>
                  </p>
                )}
              </div>

              {/* Notes */}
              <div className="mb-5 space-y-1.5">
                <Label>Notas</Label>
                <textarea
                  rows={3}
                  className={TEXTAREA_CLS}
                  placeholder="Observaciones para la factura..."
                  value={form.notes ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, notes: e.target.value }))
                  }
                />
              </div>

              {issuesOnSheet && (
                <p className="mb-3 text-xs text-muted-foreground">
                  Poné la hoja del talonario en la impresora antes de emitir:
                  al emitir se imprimen los datos de la venta sobre ella. No se
                  genera PDF ni se envía por correo.
                </p>
              )}

              {issueMutation.isError && (
                <p className="mb-3 text-xs text-destructive">
                  {apiErrorMessage(
                    issueMutation.error,
                    "Error al emitir la factura",
                  )}
                </p>
              )}

              <RequirePermission permission="billing:issue">
                <Button
                  className="w-full"
                  onClick={() => issueMutation.mutate()}
                  disabled={!canIssue || issueMutation.isPending}
                >
                  <Send size={15} />
                  {issueMutation.isPending
                    ? issuesOnSheet
                      ? "Emitiendo..."
                      : "Generando PDF y emitiendo..."
                    : issueMutation.isError
                      ? "Reintentar emisión"
                      : issuesOnSheet
                        ? "Emitir e imprimir sobre la hoja"
                        : "Emitir factura"}
                </Button>
              </RequirePermission>
            </section>
          )}

          {onSheet && <PreprintedSheetPanel invoice={invoice} />}

          <section className="divide-y divide-border rounded-xl border border-border bg-card">
            <DataGroup title="Cliente">
              <InfoRow label="Nombre" value={customerName} />
              {customer.documentNumber && (
                <InfoRow
                  label="Documento"
                  value={`${customer.documentType ?? "C.I."} ${customer.documentNumber}`}
                />
              )}
              {customer.email && <InfoRow label="Email" value={customer.email} />}
            </DataGroup>
            {(invoice.timbrado || invoice.modality) && (
              <DataGroup title="Timbrado">
                {invoice.timbrado && <InfoRow label="N° de timbrado" value={invoice.timbrado} />}
                {invoice.timbradoValidUntil && (
                  <InfoRow
                    label="Vigencia"
                    value={`${formatDatePY(invoice.timbradoValidFrom, "utc")} al ${formatDatePY(invoice.timbradoValidUntil, "utc")}`}
                  />
                )}
                {invoice.modality && (
                  <InfoRow label="Modalidad" value={MODALITY_LABELS[invoice.modality]} />
                )}
              </DataGroup>
            )}
            <DataGroup title="Historial">
              <InfoRow label="Creada" value={formatDatePY(invoice.createdAt, "local")} />
              <InfoRow
                label="Emitida"
                value={invoice.issuedAt ? formatDatePY(invoice.issuedAt, "local") : "Sin emitir"}
              />
              {invoice.dueDate && (
                <InfoRow label="Vencimiento" value={formatDatePY(invoice.dueDate, "utc")} />
              )}
            </DataGroup>
            {!isPending && invoice.notes && (
              <DataGroup title="Notas">
                <p className="text-sm text-foreground whitespace-pre-line">{invoice.notes}</p>
              </DataGroup>
            )}
          </section>

          {/* Cancel zone */}
          {canCancel && (
            <section className="rounded-xl border border-border bg-card p-5">
              {!showCancelForm ? (
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Cancelar factura
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {invoice.status === "ISSUED"
                        ? "Se generará una nota de crédito."
                        : "Se descartará el borrador."}
                    </p>
                  </div>
                  <RequirePermission permission="billing:cancel">
                    <Button
                      variant="destructive"
                      size="sm"
                      className="shrink-0"
                      onClick={() => setShowCancelForm(true)}
                    >
                      Cancelar
                    </Button>
                  </RequirePermission>
                </div>
              ) : (
                <div>
                  <div className="flex items-start gap-2 mb-3">
                    <AlertTriangle
                      size={15}
                      className="mt-0.5 shrink-0 text-destructive"
                    />
                    <p className="text-xs text-destructive">
                      {invoice.status === "ISSUED"
                        ? "Al cancelar una factura emitida se generará automáticamente una nota de crédito."
                        : "Esta acción descartará el borrador. No se generará nota de crédito."}
                    </p>
                  </div>
                  <div className="space-y-1.5 mb-3">
                    <Label className="text-destructive">Motivo *</Label>
                    <textarea
                      rows={2}
                      className="w-full min-w-0 rounded-2xl border border-destructive/30 bg-card px-3 py-2 text-sm outline-none resize-none focus-visible:border-destructive focus-visible:ring-3 focus-visible:ring-destructive/30 transition-[box-shadow,border-color]"
                      placeholder="Ej: Error en los items, cliente solicitó cambios..."
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                    />
                  </div>
                  {cancelMutation.isError && (
                    <p className="mb-2 text-xs text-destructive">
                      {apiErrorMessage(
                        cancelMutation.error,
                        "Error al cancelar",
                      )}
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={() => cancelMutation.mutate()}
                      disabled={
                        cancelReason.trim().length < 5 ||
                        cancelMutation.isPending
                      }
                    >
                      {cancelMutation.isPending
                        ? "Cancelando..."
                        : invoice.status === "ISSUED"
                          ? "Cancelar y emitir nota de crédito"
                          : "Confirmar cancelación"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCancelForm(false);
                        setCancelReason("");
                      }}
                    >
                      Volver
                    </Button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
