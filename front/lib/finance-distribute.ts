import type { Installment } from './api/finance';

export interface DistributedItem {
  installmentId: string;
  number: number;
  amount: number;
  isFull: boolean;
}

// Cargos de interés/mora todavía abiertos de una cuota (gastos administrativos,
// mora, etc.) — se suman al saldo pendiente porque el backend los cobra antes
// que el capital. Ver Installment.interestCharges en lib/api/finance.ts.
export function chargesTotalOf(inst: Installment): number {
  return (inst.interestCharges ?? []).reduce((s, c) => s + Number(c.amount), 0);
}

export function outstandingOf(inst: Installment): number {
  return inst.amount - inst.paidAmount + chargesTotalOf(inst);
}

// Mismo algoritmo greedy que LoansService.payByAmount() en el backend
// (cuotas pendientes ordenadas de la más antigua a la más nueva,
// Math.min(remaining, outstanding) por cuota, saldo = capital + recargos
// vigentes) — reimplementado acá porque esto solo genera una vista previa en
// el cliente antes de confirmar el cobro, y no hay un endpoint de "dry run"
// en el backend. Si se toca la fórmula de un lado, tocar la del otro.
export function distributeAmount(
  installments: Installment[],
  amount: number,
): { items: DistributedItem[]; remaining: number } {
  const pending = installments
    .filter((i) => i.status !== 'PAID')
    .sort((a, b) => a.number - b.number);

  let remaining = amount;
  const items: DistributedItem[] = [];
  for (const inst of pending) {
    if (remaining <= 0) break;
    const outstanding = outstandingOf(inst);
    if (outstanding <= 0) continue;
    const applied = Math.min(remaining, outstanding);
    items.push({
      installmentId: inst.id,
      number: inst.number,
      amount: applied,
      isFull: applied >= outstanding,
    });
    remaining -= applied;
  }
  return { items, remaining };
}
