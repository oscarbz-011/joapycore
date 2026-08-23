import type { Installment } from './api/finance';

export interface DistributedItem {
  installmentId: string;
  number: number;
  amount: number;
  isFull: boolean;
}

// Mismo algoritmo greedy que LoansService.payByAmount() en el backend
// (cuotas pendientes ordenadas de la más antigua a la más nueva,
// Math.min(remaining, outstanding) por cuota) — reimplementado acá porque
// esto solo genera una vista previa en el cliente antes de confirmar el
// cobro, y no hay un endpoint de "dry run" en el backend. Si se toca la
// fórmula de un lado, tocar la del otro.
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
    const outstanding = inst.amount - inst.paidAmount;
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
