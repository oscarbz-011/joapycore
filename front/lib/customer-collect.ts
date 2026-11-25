import { sumMoney } from '@/lib/money';
import type { Installment, Loan } from './api/finance';
import { outstandingOf } from './finance-distribute';
import {
  isPayable,
  loanSummary,
  selectAll,
  selectOverdue,
  type LoanSummary,
  type Selection,
} from './receivable-collect';

/** Cuota cobrable con el orden de su venta (0 = la más vieja). */
interface Payable {
  inst: Installment;
  loanIndex: number;
}

function payables(loans: Loan[]): Payable[] {
  return loans.flatMap((loan, loanIndex) =>
    loan.installments.filter(isPayable).map((inst) => ({ inst, loanIndex })),
  );
}

// Primero la cuota que venció antes, sea del producto que sea; si vencen el
// mismo día, la de la venta más vieja.
function byDueDate(a: Payable, b: Payable): number {
  return (
    a.inst.dueDate.localeCompare(b.inst.dueDate) ||
    a.loanIndex - b.loanIndex ||
    a.inst.number - b.inst.number
  );
}

export function selectOverdueAcross(loans: Loan[], now: Date = new Date()): Selection {
  return Object.assign({}, ...loans.map((loan) => selectOverdue(loan.installments, now)));
}

export function selectAllAcross(loans: Loan[]): Selection {
  return Object.assign({}, ...loans.map((loan) => selectAll(loan.installments)));
}

/** Reparte un monto entre todos los productos, por fecha de vencimiento. */
export function selectByAmountAcross(
  loans: Loan[],
  amount: number,
): { selection: Selection; leftover: number; lastIsPartial: boolean } {
  let remaining = amount;
  const selection: Selection = {};
  let lastIsPartial = false;
  for (const { inst } of payables(loans).sort(byDueDate)) {
    if (remaining <= 0) break;
    const outstanding = outstandingOf(inst);
    const applied = Math.min(remaining, outstanding);
    selection[inst.id] = applied;
    lastIsPartial = applied < outstanding;
    remaining -= applied;
  }
  return { selection, leftover: remaining, lastIsPartial };
}

/** Cuánto debe el cliente sumando todos sus productos. */
export function customerSummary(loans: Loan[], now: Date = new Date()): LoanSummary {
  const summaries = loans.map((loan) => loanSummary(loan.installments, now));
  const sum = (of: (s: LoanSummary) => number) =>
    sumMoney(summaries.map(of)).toNumber();
  const nextDue =
    summaries
      .map((s) => s.nextDue)
      .filter((inst): inst is Installment => inst != null)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0] ?? null;
  return {
    paid: sum((s) => s.paid),
    principal: sum((s) => s.principal),
    charges: sum((s) => s.charges),
    owedToday: sum((s) => s.owedToday),
    overdueCount: sum((s) => s.overdueCount),
    overdue: sum((s) => s.overdue),
    nextDue,
  };
}

export interface SelectedInstallment {
  loan: Loan;
  inst: Installment;
  amount: number;
  isFull: boolean;
}

/** Lo elegido, agrupado por producto (de la venta más vieja a la más nueva). */
export function selectedByLoan(loans: Loan[], selection: Selection): SelectedInstallment[][] {
  return loans
    .map((loan) =>
      loan.installments
        .filter((inst) => selection[inst.id] != null)
        .map((inst) => ({
          loan,
          inst,
          amount: selection[inst.id],
          isFull: selection[inst.id] >= outstandingOf(inst),
        })),
    )
    .filter((group) => group.length > 0);
}

/** Resumen de un producto para su fila plegada. */
export function loanProgress(
  loan: Loan,
  selection: Selection,
): { paidCount: number; total: number; selectedCount: number; selectedAmount: number } {
  const chosen = loan.installments.filter((inst) => selection[inst.id] != null);
  return {
    paidCount: loan.installments.filter((inst) => inst.status === 'PAID').length,
    total: loan.installments.length,
    selectedCount: chosen.length,
    selectedAmount: sumMoney(chosen.map((inst) => selection[inst.id])).toNumber(),
  };
}

/** Nombre corto del producto de una venta, para títulos y recibos. */
export function loanTitle(loan: Loan): string {
  const [first, ...rest] = loan.saleOrder.items;
  const name = first?.product?.name ?? first?.description ?? 'Venta a crédito';
  return rest.length > 0 ? `${name} y ${rest.length} más` : name;
}

export function loanInvoiceRef(loan: Loan): string | null {
  const invoice = loan.saleOrder.invoice;
  if (!invoice?.invoiceNumber) return null;
  return `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber}`;
}
