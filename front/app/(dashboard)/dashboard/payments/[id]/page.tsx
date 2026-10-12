"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, CreditCard, FileText } from "lucide-react";
import { apiErrorMessage } from "@/lib/api/api-error";
import type { InvoiceStatus } from "@/lib/api/billing";
import { financeApi, type Installment, type Loan } from "@/lib/api/finance";
import {
  paymentsApi,
  PAYMENT_METHOD_LABELS,
  type AccountsReceivable,
} from "@/lib/api/payments";
import { arUrgency } from "@/lib/ar-urgency";
import { formatDatePY } from "@/lib/date";
import { chargesTotalOf, outstandingOf } from "@/lib/finance-distribute";
import { zeroChargeNotice } from "@/lib/finance-zero-charge";
import {
  isPayable,
  loanSummary,
  selectAll,
  selectByAmount,
  selectionTotal,
  selectOverdue,
  toggle,
  type Selection,
} from "@/lib/receivable-collect";
import { cn } from "@/lib/utils";
import { NumericInput } from "@/components/numeric-input";
import { ReceiptButton } from "@/components/receipt-button";
import { RequirePermission } from "@/components/require-permission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ARStatusBadge,
  formatPrice,
  InstallmentStatusBadge,
  installmentUrgency,
  InvoiceDetailModal,
  InvStatusBadge,
  invoiceRef,
  NUM_CLS,
  PayInstallmentsModal,
  RegisterPaymentModal,
} from "../_shared";

const PANEL = "rounded-3xl bg-card p-5 shadow-sm ring-1 ring-foreground/5";

export default function ReceivablePage() {
  const { id } = useParams<{ id: string }>();
  const [showInvoice, setShowInvoice] = useState(false);

  const query = useQuery({
    queryKey: ["accounts-receivable", id],
    queryFn: () => paymentsApi.getAR(id),
  });

  if (query.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Cargando la cuenta…</p>;
  }
  if (query.isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {apiErrorMessage(query.error, "No se pudo cargar la cuenta por cobrar.")}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const ar = query.data;
  const customer = ar.invoice.saleOrder.customer;
  const isCredit = ar.invoice.saleOrder.saleType === "CREDIT";
  const contact = [
    customer.customerCode,
    customer.documentNumber ? `${customer.documentType ?? "CI"} ${customer.documentNumber}` : null,
    customer.email,
  ].filter(Boolean);

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/payments"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden />
        Cuentas por cobrar
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {customer.firstName} {customer.lastName}
            </h1>
            <ARStatusBadge status={ar.status} urgency={arUrgency(ar)} />
            {isCredit && (
              <Badge variant="outline" className="gap-1">
                <CreditCard size={11} aria-hidden />
                Crédito
              </Badge>
            )}
          </div>
          {contact.length > 0 && (
            <p className="mt-1 text-sm text-muted-foreground">{contact.join(" · ")}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium tabular-nums">Factura {invoiceRef(ar.invoice)}</span>
          <span className="text-muted-foreground tabular-nums">
            {formatDatePY(ar.invoice.issuedAt, "local")}
          </span>
          <InvStatusBadge status={ar.invoice.status as InvoiceStatus} />
          <Button variant="outline" size="sm" onClick={() => setShowInvoice(true)}>
            <FileText aria-hidden />
            Ver factura
          </Button>
        </div>
      </header>

      {isCredit ? <CreditReceivable ar={ar} /> : <CashReceivable ar={ar} />}

      <PaymentHistory ar={ar} />

      <InvoiceDetailModal invoiceId={ar.invoice.id} open={showInvoice} onOpenChange={setShowInvoice} />
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "good";
}) {
  return (
    <div className={PANEL}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "good" && "text-emerald-600",
        )}
      >
        {value}
      </dd>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Venta a crédito: plan de cuotas ───────────────────────────────────────────

function CreditReceivable({ ar }: { ar: AccountsReceivable }) {
  const queryClient = useQueryClient();
  const saleOrderId = ar.invoice.saleOrder.id;
  const [selection, setSelection] = useState<Selection>({});
  const [amount, setAmount] = useState(0);
  const [paying, setPaying] = useState(false);

  const loanQuery = useQuery<Loan>({
    queryKey: ["loan-by-order", saleOrderId],
    queryFn: () => financeApi.getLoanByOrder(saleOrderId),
    retry: false,
  });

  if (loanQuery.isPending) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Cargando cuotas…</p>;
  }
  if (!loanQuery.data) {
    const status = (loanQuery.error as { response?: { status?: number } } | null)?.response?.status;
    return (
      <p className={cn(PANEL, "text-center text-sm text-muted-foreground")}>
        {status === 403
          ? "El módulo de finanzas no está habilitado para esta empresa."
          : status === 404
            ? "Todavía no se generó el préstamo de esta venta. Verificá que el crédito esté aprobado."
            : "No se pudo cargar el plan de cuotas."}
      </p>
    );
  }

  const loan = loanQuery.data;
  const installments = loan.installments;
  const summary = loanSummary(installments);
  const total = Number(loan.totalAmount);
  const selected = installments.filter((inst) => selection[inst.id] != null);
  const toCollect = selectionTotal(selection);
  const preview = amount > 0 ? selectByAmount(installments, amount) : null;
  const overdueDays = installments
    .map((inst) => installmentUrgency(inst))
    .filter((urgency) => urgency.level === "overdue")
    .map((urgency) => urgency.days);

  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label="Total adeudado hoy"
          value={formatPrice(summary.owedToday)}
          hint={`Cuotas ${formatPrice(summary.principal)} + recargos ${formatPrice(summary.charges)}`}
        />
        <Figure
          label="Vencido"
          value={formatPrice(summary.overdue)}
          hint={
            summary.overdueCount === 0
              ? "Sin cuotas vencidas"
              : `${summary.overdueCount} ${summary.overdueCount === 1 ? "cuota vencida" : "cuotas vencidas"}, con recargos`
          }
          tone={summary.overdueCount > 0 ? "danger" : undefined}
        />
        <Figure
          label="Cobrado"
          value={formatPrice(summary.paid)}
          hint={`de ${formatPrice(total)} a crédito`}
          tone="good"
        />
        <Figure
          label="Próxima cuota"
          value={summary.nextDue ? formatDatePY(summary.nextDue.dueDate, "utc") : "—"}
          hint={
            summary.nextDue
              ? `Cuota ${summary.nextDue.number} de ${loan.totalInstallments} · ${formatPrice(outstandingOf(summary.nextDue))}`
              : "Crédito saldado"
          }
        />
      </dl>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <section aria-label="Cuotas" className={PANEL}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Cuotas</h2>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={summary.overdueCount === 0}
                onClick={() => setSelection(selectOverdue(installments))}
              >
                Seleccionar vencidas
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!summary.nextDue}
                onClick={() => setSelection(selectAll(installments))}
              >
                Seleccionar todas
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={selected.length === 0}
                onClick={() => setSelection({})}
              >
                Limpiar
              </Button>
            </div>
          </div>

          {summary.overdueCount > 0 && summary.charges === 0 && (
            <p className="mt-3 rounded-2xl bg-warn-subtle px-3 py-2 text-xs text-foreground">
              {zeroChargeNotice({
                graceDays: loan.moraPolicy?.graceDays ?? 0,
                hasMoraComponents: (loan.moraPolicy?.components.length ?? 0) > 0,
                overdueDays,
              })}
            </p>
          )}

          <div className="mt-4 overflow-x-auto">
            <InstallmentsTable
              installments={installments}
              selection={selection}
              onToggle={(inst) => setSelection((current) => toggle(current, inst))}
            />
          </div>
        </section>

        <aside aria-label="Cobrar" className={cn(PANEL, "h-fit space-y-4 xl:sticky xl:top-4")}>
          <h2 className="text-base font-semibold">Cobrar</h2>

          <div className="space-y-1.5">
            <Label htmlFor="collect-amount">Monto que entrega el cliente</Label>
            <div className="flex gap-2">
              <NumericInput
                id="collect-amount"
                value={amount}
                onChange={setAmount}
                className={NUM_CLS}
                placeholder="0"
              />
              <Button
                variant="outline"
                className="shrink-0"
                disabled={!preview || Object.keys(preview.selection).length === 0}
                onClick={() => preview && setSelection(preview.selection)}
              >
                Aplicar
              </Button>
            </div>
            {preview && (
              <p className="text-xs text-muted-foreground">
                {Object.keys(preview.selection).length === 0
                  ? "No hay cuotas pendientes para cubrir."
                  : `Cubre ${Object.keys(preview.selection).length} ${
                      Object.keys(preview.selection).length === 1 ? "cuota" : "cuotas"
                    }${preview.lastIsPartial ? "; la última queda parcial" : ""}.`}
                {preview.leftover > 0 && ` Sobran ${formatPrice(preview.leftover)}.`}
              </p>
            )}
          </div>

          <div className="rounded-2xl bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">
              {selected.length === 0
                ? "Elegí las cuotas a cobrar en la tabla."
                : `${selected.length} ${selected.length === 1 ? "cuota seleccionada" : "cuotas seleccionadas"}`}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPrice(toCollect)}</p>
          </div>

          <RequirePermission permission="finance:payments:apply">
            <Button className="w-full" disabled={selected.length === 0} onClick={() => setPaying(true)}>
              Cobrar
            </Button>
          </RequirePermission>

          <dl className="space-y-1.5 border-t border-border pt-4 text-sm">
            <Detail label="Capital financiado" value={formatPrice(Number(loan.principal))} />
            {Number(loan.interestRate) > 0 && (
              <Detail label="Tasa de interés" value={`${Number(loan.interestRate)}%`} />
            )}
            <Detail label="Total a crédito" value={formatPrice(total)} />
            <Detail
              label="Plan"
              value={`${loan.totalInstallments} cuotas de ${formatPrice(Number(installments[0]?.amount ?? 0))}`}
            />
          </dl>
        </aside>
      </div>

      <PayInstallmentsModal
        loanId={loan.id}
        saleOrderId={saleOrderId}
        items={selected.map((inst) => ({
          installmentId: inst.id,
          number: inst.number,
          amount: selection[inst.id],
          isFull: selection[inst.id] >= outstandingOf(inst),
        }))}
        open={paying}
        onOpenChange={(open) => {
          if (!open) setPaying(false);
        }}
        onSaved={() => {
          setPaying(false);
          setSelection({});
          setAmount(0);
          void queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
        }}
      />
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium tabular-nums">{value}</dd>
    </div>
  );
}

function InstallmentsTable({
  installments,
  selection,
  onToggle,
}: {
  installments: Installment[];
  selection: Selection;
  onToggle: (inst: Installment) => void;
}) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggleCharges = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <span className="sr-only">Cobrar</span>
          </TableHead>
          <TableHead>N.º</TableHead>
          <TableHead>Vencimiento</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="text-right">Cuota</TableHead>
          <TableHead className="text-right">Pagado</TableHead>
          <TableHead className="text-right">Recargos</TableHead>
          <TableHead className="text-right">A pagar</TableHead>
          <TableHead className="text-right">A cobrar ahora</TableHead>
          <TableHead>Recibo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {installments.map((inst) => {
          const charges = inst.interestCharges ?? [];
          const chargesTotal = chargesTotalOf(inst);
          const payable = isPayable(inst);
          const chosen = selection[inst.id];
          const showCharges = open.has(inst.id);
          return (
            <Fragment key={inst.id}>
              <TableRow data-state={chosen != null ? "selected" : undefined}>
                <TableCell>
                  {payable && (
                    <Checkbox
                      checked={chosen != null}
                      onCheckedChange={() => onToggle(inst)}
                      aria-label={`Cobrar la cuota ${inst.number}`}
                    />
                  )}
                </TableCell>
                <TableCell className="tabular-nums">{inst.number}</TableCell>
                <TableCell className="tabular-nums">{formatDatePY(inst.dueDate, "utc")}</TableCell>
                <TableCell>
                  <InstallmentStatusBadge status={inst.status} urgency={installmentUrgency(inst)} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatPrice(Number(inst.amount))}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {Number(inst.paidAmount) > 0 ? formatPrice(Number(inst.paidAmount)) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {chargesTotal > 0 ? (
                    <button
                      type="button"
                      aria-expanded={showCharges}
                      onClick={() => toggleCharges(inst.id)}
                      className="inline-flex items-center gap-1 text-destructive underline-offset-4 hover:underline"
                    >
                      {formatPrice(chargesTotal)}
                      <ChevronDown
                        size={13}
                        aria-hidden
                        className={cn("transition-transform", showCharges && "rotate-180")}
                      />
                    </button>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {payable ? formatPrice(outstandingOf(inst)) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {chosen == null ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <span className="font-medium">
                      {formatPrice(chosen)}
                      {chosen < outstandingOf(inst) && (
                        <span className="ml-1 font-normal text-muted-foreground">(parcial)</span>
                      )}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {Number(inst.paidAmount) > 0 && <ReceiptButton installmentId={inst.id} />}
                </TableCell>
              </TableRow>
              {showCharges && (
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableCell colSpan={10}>
                    <ul className="ml-10 space-y-0.5 text-xs text-muted-foreground">
                      {charges.map((charge) => (
                        <li key={charge.id} className="flex max-w-sm justify-between gap-4">
                          <span>{charge.component.name}</span>
                          <span className="tabular-nums">{formatPrice(Number(charge.amount))}</span>
                        </li>
                      ))}
                    </ul>
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}

// ── Venta al contado: un solo saldo ───────────────────────────────────────────

function CashReceivable({ ar }: { ar: AccountsReceivable }) {
  const queryClient = useQueryClient();
  const [registering, setRegistering] = useState(false);
  const urgency = arUrgency(ar);
  const total = Number(ar.amount);
  const paid = Number(ar.paidAmount);
  const open = ar.status === "PENDING" || ar.status === "PARTIAL";

  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label="Saldo pendiente"
          value={formatPrice(total - paid)}
          tone={urgency.level === "overdue" ? "danger" : undefined}
        />
        <Figure label="Total de la factura" value={formatPrice(total)} />
        <Figure label="Pagado" value={formatPrice(paid)} tone="good" />
        <Figure
          label="Vencimiento"
          value={ar.dueDate ? formatDatePY(ar.dueDate, "utc") : "—"}
          hint={
            urgency.level === "overdue"
              ? `${urgency.days} ${urgency.days === 1 ? "día" : "días"} de mora`
              : undefined
          }
          tone={urgency.level === "overdue" ? "danger" : undefined}
        />
      </dl>

      {open && (
        <RequirePermission permission="payments:register">
          <Button onClick={() => setRegistering(true)}>Registrar pago</Button>
        </RequirePermission>
      )}

      <RegisterPaymentModal
        ar={ar}
        open={registering}
        onOpenChange={(next) => {
          if (!next) setRegistering(false);
        }}
        onSaved={() => {
          setRegistering(false);
          void queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
        }}
      />
    </>
  );
}

function PaymentHistory({ ar }: { ar: AccountsReceivable }) {
  if (ar.paymentRecords.length === 0) return null;
  return (
    <section aria-label="Historial de pagos" className={PANEL}>
      <h2 className="text-base font-semibold">Historial de pagos</h2>
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Fecha</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Medio</TableHead>
              <TableHead>Referencia</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ar.paymentRecords.map((record) => (
              <TableRow key={record.id}>
                <TableCell className="tabular-nums">{formatDatePY(record.paymentDate, "utc")}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatPrice(Number(record.amount))}
                </TableCell>
                <TableCell>{PAYMENT_METHOD_LABELS[record.paymentMethod]}</TableCell>
                <TableCell className="text-muted-foreground">{record.reference ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
