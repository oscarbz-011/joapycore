import type { AccountsReceivable } from './api/payments';
import { daysOverdue } from './overdue';

// Días de anticipación para marcar una cuota de crédito como "por vencer"
// (ámbar) antes de que esté vencida — el pedido concreto que motivó esto:
// notificar antes de que se venza, no solo después.
export const DUE_SOON_DAYS = 5;

export type ArUrgencyLevel = 'overdue' | 'due-soon' | 'pending' | null;

export interface ArUrgency {
  level: ArUrgencyLevel;
  days: number; // overdue: días de mora. due-soon: días restantes. pending/null: sin uso.
  installmentNumber?: number; // solo crédito — a qué cuota corresponde
}

// Al contado, una cuenta pendiente lo está desde el día uno (hay que cobrar
// para entregar el producto) — se mantiene el criterio agresivo de siempre:
// cualquier no-pagada es "Pendiente" ya, y "Vencida" apenas pasa la fecha.
//
// A crédito, la cuenta se financia en varias cuotas mensuales — marcar TODA
// la cuenta como "vencida" en cuanto pasa la fecha de la primera cuota (que
// es lo que hacía antes, porque el AR.dueDate se fija una sola vez y nunca
// se actualiza) generaba ruido: un cliente al día con 6-12 cuotas quedaba
// marcado como moroso para siempre. Acá se mira la cuota real más próxima
// sin pagar en vez de esa fecha estática — solo avisa cuando esa cuota
// puntual está vencida o por vencer, ninguna otra. La detección de
// "vencida" en sí sigue siendo tan inmediata como siempre (no depende de
// esperar al cron nocturno) — lo único que cambió es CUÁL fecha mira.
export function arUrgency(ar: AccountsReceivable): ArUrgency {
  if (ar.status === 'PAID' || ar.status === 'CANCELLED') return { level: null, days: 0 };

  const isCredit = ar.invoice.saleOrder.saleType === 'CREDIT';

  if (!isCredit) {
    if (ar.dueDate) {
      const days = daysOverdue(ar.dueDate);
      if (days > 0) return { level: 'overdue', days };
    }
    return { level: 'pending', days: 0 };
  }

  const installments = ar.invoice.saleOrder.loan?.installments ?? [];
  const nextUnpaid = [...installments].sort((a, b) => a.number - b.number).find((i) => i.status !== 'PAID');
  if (!nextUnpaid) return { level: null, days: 0 };

  // No alcanza con confiar solo en installment.status === 'OVERDUE' — ese
  // campo lo pone el cron nocturno (installments-scheduler.service.ts), así
  // que una cuota recién vencida (o cualquier corrida antes de medianoche)
  // seguiría en PENDING y no se detectaría. Se toma la fecha directamente
  // como respaldo — la detección de "vencida" queda tan inmediata como era
  // antes, solo que ahora mirando la cuota correcta en vez del AR entero.
  const overdueDays = daysOverdue(nextUnpaid.dueDate);
  if (nextUnpaid.status === 'OVERDUE' || overdueDays > 0) {
    return { level: 'overdue', days: Math.max(0, overdueDays), installmentNumber: nextUnpaid.number };
  }
  const daysUntil = -overdueDays;
  if (daysUntil >= 0 && daysUntil <= DUE_SOON_DAYS) {
    return { level: 'due-soon', days: daysUntil, installmentNumber: nextUnpaid.number };
  }
  return { level: null, days: 0 };
}

// Fecha a mostrar en la columna "Vencimiento" — para crédito, la cuota real
// más próxima sin pagar (no el AR.dueDate estático, sería inconsistente
// mostrar una fecha vieja al lado de un estado calculado sobre la cuota
// actual).
export function arDisplayDueDate(ar: AccountsReceivable): string | null {
  const isCredit = ar.invoice.saleOrder.saleType === 'CREDIT';
  if (!isCredit) return ar.dueDate;
  const installments = ar.invoice.saleOrder.loan?.installments ?? [];
  const nextUnpaid = [...installments].sort((a, b) => a.number - b.number).find((i) => i.status !== 'PAID');
  return nextUnpaid?.dueDate ?? null;
}
