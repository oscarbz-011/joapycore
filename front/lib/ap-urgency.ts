import type { AccountsPayable } from './api/payables';
import { daysOverdue } from './overdue';

// Solo la rama "contado" de ar-urgency.ts — no hay financiamiento en cuotas
// del lado de Compras hoy, así que no existe una rama de crédito acá.
export type ApUrgencyLevel = 'overdue' | 'pending' | null;

export interface ApUrgency {
  level: ApUrgencyLevel;
  days: number; // overdue: días de mora.
}

export function apUrgency(ap: AccountsPayable): ApUrgency {
  if (ap.status === 'PAID' || ap.status === 'CANCELLED') return { level: null, days: 0 };

  if (ap.dueDate) {
    const days = daysOverdue(ap.dueDate);
    if (days > 0) return { level: 'overdue', days };
  }
  return { level: 'pending', days: 0 };
}
