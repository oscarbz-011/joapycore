const DAY_MS = 86_400_000;

/** Calificación del cliente: 1 = paga al día … 5 = se atrasa mucho, 6 = incobrable/judicial. */
export type CreditScore = 1 | 2 | 3 | 4 | 5 | 6;

/**
 * Límite superior (en días de atraso promedio) de los niveles 1 a 4; por
 * encima del último es nivel 5. Es el default de CreditConfig — cada tenant
 * lo ajusta en Ajustes → Créditos.
 */
export const DEFAULT_RATING_DELAY_THRESHOLDS = [0, 5, 15, 30];

export interface DelayInput {
  dueDate: Date;
  paidAt: Date | null;
  status: string;
}

const dayNumber = (date: Date) => Math.floor(date.getTime() / DAY_MS);

/**
 * Días de atraso de una cuota. Una cuota pagada cuenta hasta el día en que se
 * pagó; una impaga y vencida, hasta hoy. null = todavía no se puede evaluar
 * (no venció y no está pagada), así que no entra en ningún promedio.
 */
export function installmentDelayDays(
  installment: DelayInput,
  today: Date,
): number | null {
  const due = dayNumber(installment.dueDate);
  if (installment.status === 'PAID') {
    return installment.paidAt
      ? Math.max(dayNumber(installment.paidAt) - due, 0)
      : 0;
  }
  const late = dayNumber(today) - due;
  return late > 0 ? late : null;
}

/** Promedio con un decimal; null si no hay cuotas evaluables. */
export function averageDelayDays(delays: number[]): number | null {
  if (delays.length === 0) return null;
  const mean = delays.reduce((sum, days) => sum + days, 0) / delays.length;
  return Math.round(mean * 10) / 10;
}

export function scoreFromAverageDelay(
  average: number,
  thresholds: number[],
): 1 | 2 | 3 | 4 | 5 {
  const level = thresholds.findIndex((limit) => average <= limit);
  return (level === -1 ? 5 : level + 1) as 1 | 2 | 3 | 4 | 5;
}
