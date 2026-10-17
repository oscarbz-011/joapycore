import type { Installment } from './api/finance';
import { chargesTotalOf, distributeAmount, outstandingOf } from './finance-distribute';
import { daysOverdue } from './overdue';

/** Cuota → monto a cobrar. */
export type Selection = Record<string, number>;

export function isPayable(inst: Installment): boolean {
  return inst.status !== 'PAID' && outstandingOf(inst) > 0;
}

export function isOverdue(inst: Installment, now: Date = new Date()): boolean {
  return isPayable(inst) && daysOverdue(inst.dueDate, now) > 0;
}

export interface LoanSummary {
  paid: number;
  /** Saldo de cuotas, sin recargos. */
  principal: number;
  charges: number;
  /** Lo que salda la deuda hoy: cuotas más recargos. */
  owedToday: number;
  overdueCount: number;
  /** Cuotas vencidas con sus recargos. */
  overdue: number;
  /** Próxima cuota sin pagar. */
  nextDue: Installment | null;
}

export function loanSummary(installments: Installment[], now: Date = new Date()): LoanSummary {
  const open = installments.filter(isPayable).sort((a, b) => a.number - b.number);
  const overdue = open.filter((inst) => isOverdue(inst, now));
  const sum = (list: Installment[], of: (inst: Installment) => number) =>
    list.reduce((total, inst) => total + of(inst), 0);
  const principalOf = (inst: Installment) => Math.max(inst.amount - inst.paidAmount, 0);
  const charges = sum(installments, chargesTotalOf);
  const principal = sum(installments, principalOf);
  return {
    paid: sum(installments, (inst) => Number(inst.paidAmount)),
    principal,
    charges,
    owedToday: principal + charges,
    overdueCount: overdue.length,
    overdue: sum(overdue, outstandingOf),
    nextDue: open[0] ?? null,
  };
}

const full = (list: Installment[]): Selection =>
  Object.fromEntries(list.map((inst) => [inst.id, outstandingOf(inst)]));

export function selectOverdue(installments: Installment[], now: Date = new Date()): Selection {
  return full(installments.filter((inst) => isOverdue(inst, now)));
}

export function selectAll(installments: Installment[]): Selection {
  return full(installments.filter(isPayable));
}

/** Las cuotas más viejas que cubre un monto; la última puede quedar parcial. */
export function selectByAmount(
  installments: Installment[],
  amount: number,
): { selection: Selection; leftover: number; lastIsPartial: boolean } {
  const { items, remaining } = distributeAmount(installments, amount);
  return {
    selection: Object.fromEntries(items.map((item) => [item.installmentId, item.amount])),
    leftover: remaining,
    lastIsPartial: items.length > 0 && !items[items.length - 1].isFull,
  };
}

export function toggle(selection: Selection, inst: Installment): Selection {
  if (selection[inst.id] != null) {
    const next = { ...selection };
    delete next[inst.id];
    return next;
  }
  return { ...selection, [inst.id]: outstandingOf(inst) };
}

export function selectionTotal(selection: Selection): number {
  return Object.values(selection).reduce((total, amount) => total + amount, 0);
}
