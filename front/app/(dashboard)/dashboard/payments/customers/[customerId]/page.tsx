"use client";
import { sumMoney } from "@/lib/money";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ChevronDown, FileText } from "lucide-react";
import { apiErrorMessage } from "@/lib/api/api-error";
import { financeApi, type Loan } from "@/lib/api/finance";
import { paymentsApi, type AccountsReceivable } from "@/lib/api/payments";
import { arUrgency } from "@/lib/ar-urgency";
import {
  customerSummary,
  loanInvoiceRef,
  loanProgress,
  loanTitle,
  selectAllAcross,
  selectByAmountAcross,
  selectedByLoan,
  selectOverdueAcross,
} from "@/lib/customer-collect";
import { formatDatePY } from "@/lib/date";
import { outstandingOf } from "@/lib/finance-distribute";
import { zeroChargeNotice } from "@/lib/finance-zero-charge";
import { loanSummary, selectionTotal, toggle, type Selection } from "@/lib/receivable-collect";
import { cn } from "@/lib/utils";
import { NumericInput } from "@/components/numeric-input";
import { RequirePermission } from "@/components/require-permission";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Detail, Figure, InstallmentsTable, PANEL } from "../../_collect";
import { PayCustomerInstallmentsModal } from "../../_customer-pay-modal";
import {
  ARStatusBadge,
  formatPrice,
  installmentUrgency,
  InvoiceDetailModal,
  invoiceRef,
  NUM_CLS,
  productSummary,
  RegisterPaymentModal,
} from "../../_shared";

const isOpen = (ar: AccountsReceivable) => ar.status === "PENDING" || ar.status === "PARTIAL";

export default function CustomerReceivablesPage() {
  const { customerId } = useParams<{ customerId: string }>();

  const arQuery = useQuery({ queryKey: ["accounts-receivable"], queryFn: paymentsApi.listAR });
  const loansQuery = useQuery<Loan[]>({
    queryKey: ["customer-loans", customerId],
    queryFn: () => financeApi.getLoansByCustomer(customerId),
    retry: false,
  });

  if (arQuery.isPending) {
    return <p className="py-16 text-center text-sm text-muted-foreground">Cargando las cuentas del cliente…</p>;
  }
  if (arQuery.isError) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">
          {apiErrorMessage(arQuery.error, "No se pudieron cargar las cuentas por cobrar.")}
        </p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void arQuery.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  const receivables = arQuery.data.filter((ar) => ar.invoice.saleOrder.customer.id === customerId);
  const customer = receivables[0]?.invoice.saleOrder.customer;
  const cashOpen = receivables.filter((ar) => ar.invoice.saleOrder.saleType !== "CREDIT" && isOpen(ar));
  const contact = customer
    ? [
        customer.customerCode,
        customer.documentNumber ? `${customer.documentType ?? "CI"} ${customer.documentNumber}` : null,
        customer.email,
      ].filter(Boolean)
    : [];

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/payments"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={14} aria-hidden />
        Cuentas por cobrar
      </Link>

      <header>
        <h1 className="text-2xl font-semibold">
          {customer ? `${customer.firstName} ${customer.lastName}` : "Cliente"}
        </h1>
        {contact.length > 0 && <p className="mt-1 text-sm text-muted-foreground">{contact.join(" · ")}</p>}
      </header>

      <CreditSection customerId={customerId} query={loansQuery} />

      {cashOpen.length > 0 && <CashSection receivables={cashOpen} />}

      {!loansQuery.isPending && (loansQuery.data?.length ?? 0) === 0 && cashOpen.length === 0 && (
        <p className={cn(PANEL, "text-center text-sm text-muted-foreground")}>
          Este cliente no tiene cuentas pendientes.
        </p>
      )}
    </div>
  );
}

// ── Ventas a crédito: todas las cuotas del cliente ────────────────────────────

function CreditSection({
  customerId,
  query,
}: {
  customerId: string;
  query: UseQueryResult<Loan[]>;
}) {
  const queryClient = useQueryClient();
  const [selection, setSelection] = useState<Selection>({});
  const [amount, setAmount] = useState(0);
  const [paying, setPaying] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [openLoans, setOpenLoans] = useState<Set<string>>(new Set());
  // Elegir a mano deja sin efecto el monto tipeado.
  const pick = (next: Selection) => {
    setSelection(next);
    setAmount(0);
  };

  if (query.isPending) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Cargando cuotas…</p>;
  }
  if (query.isError) {
    const status = (query.error as { response?: { status?: number } } | null)?.response?.status;
    return (
      <div className={cn(PANEL, "text-center text-sm text-muted-foreground")}>
        <p>
          {status === 403
            ? "El módulo de finanzas no está habilitado para esta empresa."
            : apiErrorMessage(query.error, "No se pudieron cargar las cuotas del cliente.")}
        </p>
        {status !== 403 && (
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void query.refetch()}>
            Reintentar
          </Button>
        )}
      </div>
    );
  }

  const loans = query.data;
  if (loans.length === 0) return null;

  const summary = customerSummary(loans);
  const groups = selectedByLoan(loans, selection);
  const selectedCount = groups.reduce((count, group) => count + group.length, 0);
  const toCollect = selectionTotal(selection);
  const preview = amount > 0 ? selectByAmountAcross(loans, amount) : null;
  const previewCount = preview ? Object.keys(preview.selection).length : 0;
  const nextDueLoan = summary.nextDue
    ? loans.find((loan) => loan.installments.some((inst) => inst.id === summary.nextDue?.id))
    : undefined;
  const paid = sumMoney(loans.map((loan) => loanSummary(loan.installments).paid)).toNumber();
  const financed = sumMoney(loans.map((loan) => loan.totalAmount)).toNumber();
  // Con un solo producto no hace falta plegarlo.
  const isLoanOpen = (loanId: string) => loans.length === 1 || openLoans.has(loanId);
  const allOpen = loans.every((loan) => isLoanOpen(loan.id));
  const toggleLoan = (loanId: string) =>
    setOpenLoans((current) => {
      const next = new Set(current);
      if (!next.delete(loanId)) next.add(loanId);
      return next;
    });

  return (
    <>
      <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Figure
          label="Total adeudado hoy"
          value={formatPrice(summary.owedToday)}
          hint={`${loans.length} ${loans.length === 1 ? "producto" : "productos"} · cuotas ${formatPrice(summary.principal)} + recargos ${formatPrice(summary.charges)}`}
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
        <Figure label="Cobrado" value={formatPrice(paid)} hint={`de ${formatPrice(financed)} a crédito`} tone="good" />
        <Figure
          label="Próxima cuota"
          value={summary.nextDue ? formatDatePY(summary.nextDue.dueDate, "utc") : "—"}
          hint={
            summary.nextDue && nextDueLoan
              ? `${loanTitle(nextDueLoan)} · cuota ${summary.nextDue.number} · ${formatPrice(outstandingOf(summary.nextDue))}`
              : "Créditos saldados"
          }
        />
      </dl>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-semibold">
              Cuotas de {loans.length} {loans.length === 1 ? "producto" : "productos"}
            </h2>
            <div className="flex flex-wrap gap-2">
              {loans.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    setOpenLoans(allOpen ? new Set() : new Set(loans.map((loan) => loan.id)))
                  }
                >
                  {allOpen ? "Contraer todos" : "Expandir todos"}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                disabled={summary.overdueCount === 0}
                onClick={() => pick(selectOverdueAcross(loans))}
              >
                Seleccionar vencidas
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!summary.nextDue}
                onClick={() => pick(selectAllAcross(loans))}
              >
                Seleccionar todas
              </Button>
              <Button variant="ghost" size="sm" disabled={selectedCount === 0} onClick={() => pick({})}>
                Limpiar
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {loans.map((loan) => (
              <LoanPanel
                key={loan.id}
                loan={loan}
                open={isLoanOpen(loan.id)}
                collapsible={loans.length > 1}
                onOpenChange={() => toggleLoan(loan.id)}
                selection={selection}
                onToggle={(inst) => pick(toggle(selection, inst))}
                onShowInvoice={setInvoiceId}
              />
            ))}
          </div>
        </div>

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
                disabled={!preview || previewCount === 0}
                onClick={() => preview && setSelection(preview.selection)}
              >
                Aplicar
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {!preview
                ? "Se reparte entre todos los productos, primero las cuotas que vencieron antes."
                : previewCount === 0
                  ? "No hay cuotas pendientes para cubrir."
                  : `Cubre ${previewCount} ${previewCount === 1 ? "cuota" : "cuotas"}${preview.lastIsPartial ? "; la última queda parcial" : ""}.`}
              {preview && preview.leftover > 0 && ` Sobran ${formatPrice(preview.leftover)}.`}
            </p>
          </div>

          <div className="rounded-2xl bg-muted/40 p-4">
            <p className="text-xs text-muted-foreground">
              {selectedCount === 0
                ? "Elegí las cuotas a cobrar en las tablas."
                : `${selectedCount} ${selectedCount === 1 ? "cuota" : "cuotas"} de ${groups.length} ${groups.length === 1 ? "producto" : "productos"}`}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{formatPrice(toCollect)}</p>
            {groups.length > 1 && (
              <dl className="mt-3 space-y-1 border-t border-border pt-3 text-xs">
                {groups.map((group) => (
                  <Detail
                    key={group[0].loan.id}
                    label={loanTitle(group[0].loan)}
                    value={formatPrice(sumMoney(group.map((item) => item.amount)).toNumber())}
                  />
                ))}
              </dl>
            )}
          </div>

          <RequirePermission permission="finance:payments:apply">
            <Button className="w-full" disabled={selectedCount === 0} onClick={() => setPaying(true)}>
              Cobrar
            </Button>
          </RequirePermission>
        </aside>
      </div>

      <PayCustomerInstallmentsModal
        customerId={customerId}
        groups={groups}
        open={paying}
        onOpenChange={(open) => {
          if (!open) setPaying(false);
        }}
        onSaved={() => {
          setPaying(false);
          setSelection({});
          setAmount(0);
          void queryClient.invalidateQueries({ queryKey: ["customer-loans", customerId] });
          void queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
          void queryClient.invalidateQueries({ queryKey: ["loan-by-order"] });
        }}
      />

      {invoiceId && (
        <InvoiceDetailModal
          invoiceId={invoiceId}
          open
          onOpenChange={(open) => {
            if (!open) setInvoiceId(null);
          }}
        />
      )}
    </>
  );
}

function LoanPanel({
  loan,
  open,
  collapsible,
  onOpenChange,
  selection,
  onToggle,
  onShowInvoice,
}: {
  loan: Loan;
  open: boolean;
  collapsible: boolean;
  onOpenChange: () => void;
  selection: Selection;
  onToggle: Parameters<typeof InstallmentsTable>[0]["onToggle"];
  onShowInvoice: (invoiceId: string) => void;
}) {
  const [showPaid, setShowPaid] = useState(false);
  const summary = loanSummary(loan.installments);
  const progress = loanProgress(loan, selection);
  const title = loanTitle(loan);
  const invoice = loanInvoiceRef(loan);
  const bodyId = `loan-${loan.id}`;
  const installments = showPaid
    ? loan.installments
    : loan.installments.filter((inst) => inst.status !== "PAID");
  const overdueDays = loan.installments
    .map((inst) => installmentUrgency(inst))
    .filter((urgency) => urgency.level === "overdue")
    .map((urgency) => urgency.days);

  const heading = (
    <div className="grid min-w-0 flex-1 gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1.6fr)_repeat(4,minmax(0,1fr))] sm:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="truncate font-semibold">{title}</h3>
          {summary.overdueCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle size={10} aria-hidden />
              {summary.overdueCount} {summary.overdueCount === 1 ? "vencida" : "vencidas"}
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground tabular-nums">
          {[invoice ? `Factura ${invoice}` : null, `Venta del ${formatDatePY(loan.saleOrder.orderDate, "local")}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <Stat label="Cuotas pagadas" value={`${progress.paidCount} de ${progress.total}`} />
      <Stat
        label="Próxima cuota"
        value={summary.nextDue ? formatDatePY(summary.nextDue.dueDate, "utc") : "—"}
        tone={summary.overdueCount > 0 ? "danger" : undefined}
      />
      <Stat label="Debe" value={formatPrice(summary.owedToday)} />
      <Stat
        label="A cobrar ahora"
        value={progress.selectedCount > 0 ? formatPrice(progress.selectedAmount) : "—"}
        hint={
          progress.selectedCount > 0
            ? `${progress.selectedCount} ${progress.selectedCount === 1 ? "cuota" : "cuotas"}`
            : undefined
        }
        tone={progress.selectedCount > 0 ? "selected" : undefined}
      />
    </div>
  );

  return (
    <section
      aria-label={title}
      className={cn(
        "rounded-3xl bg-card shadow-sm ring-1 ring-foreground/5",
        progress.selectedCount > 0 && "ring-2 ring-primary/40",
      )}
    >
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={onOpenChange}
          className="flex w-full items-center gap-3 rounded-3xl px-5 py-4 text-left hover:bg-muted/20 focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronDown
            size={16}
            aria-hidden
            className={cn("shrink-0 text-muted-foreground transition-transform", !open && "-rotate-90")}
          />
          {heading}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-5 py-4">{heading}</div>
      )}

      {open && (
        <div id={bodyId} className="border-t border-border px-5 pb-5 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground tabular-nums">
              {loan.totalInstallments} cuotas de {formatPrice(Number(loan.installments[0]?.amount ?? 0))}
            </p>
            <div className="flex flex-wrap gap-2">
              {progress.paidCount > 0 && (
                <Button variant="ghost" size="sm" onClick={() => setShowPaid((value) => !value)}>
                  {showPaid ? "Ocultar pagadas" : `Mostrar pagadas (${progress.paidCount})`}
                </Button>
              )}
              {loan.saleOrder.invoice && (
                <Button variant="outline" size="sm" onClick={() => onShowInvoice(loan.saleOrder.invoice!.id)}>
                  <FileText aria-hidden />
                  Ver factura
                </Button>
              )}
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

          <div className="mt-3 overflow-x-auto">
            <InstallmentsTable
              installments={installments}
              selection={selection}
              onToggle={onToggle}
              productLabel={title}
            />
          </div>
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "danger" | "selected";
}) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p
        className={cn(
          "truncate text-sm font-medium tabular-nums",
          tone === "danger" && "text-destructive",
          tone === "selected" && "text-primary",
        )}
      >
        {value}
        {hint && <span className="ml-1 text-xs font-normal text-muted-foreground">({hint})</span>}
      </p>
    </div>
  );
}

// ── Ventas al contado: se cobran aparte ───────────────────────────────────────

function CashSection({ receivables }: { receivables: AccountsReceivable[] }) {
  const queryClient = useQueryClient();
  const [paying, setPaying] = useState<AccountsReceivable | null>(null);

  return (
    <section aria-label="Ventas al contado pendientes" className={PANEL}>
      <h2 className="text-base font-semibold">Ventas al contado pendientes</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">Se cobran por separado de las cuotas.</p>
      <div className="mt-4 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Factura</TableHead>
              <TableHead>Producto</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead className="text-right">Pendiente</TableHead>
              <TableHead>
                <span className="sr-only">Acción</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {receivables.map((ar) => (
              <TableRow key={ar.id}>
                <TableCell className="tabular-nums">{invoiceRef(ar.invoice)}</TableCell>
                <TableCell>{productSummary(ar.invoice.items)}</TableCell>
                <TableCell className="tabular-nums">{ar.dueDate ? formatDatePY(ar.dueDate, "utc") : "—"}</TableCell>
                <TableCell>
                  <ARStatusBadge status={ar.status} urgency={arUrgency(ar)} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatPrice(Number(ar.amount))}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {formatPrice(Number(ar.amount) - Number(ar.paidAmount))}
                </TableCell>
                <TableCell className="text-right">
                  <RequirePermission permission="payments:register">
                    <Button size="sm" variant="outline" onClick={() => setPaying(ar)}>
                      Registrar pago
                    </Button>
                  </RequirePermission>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {paying && (
        <RegisterPaymentModal
          ar={paying}
          open
          onOpenChange={(open) => {
            if (!open) setPaying(null);
          }}
          onSaved={() => {
            setPaying(null);
            void queryClient.invalidateQueries({ queryKey: ["accounts-receivable"] });
          }}
        />
      )}
    </section>
  );
}
