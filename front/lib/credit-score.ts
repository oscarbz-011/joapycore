import type { CreditHistory, CreditScore } from './api/sales';

// 1 = paga al día … 5 = se atrasa mucho; 6 = incobrable/judicial.
export const SCORE_LABELS: Record<CreditScore, string> = {
  1: 'Excelente',
  2: 'Bueno',
  3: 'Regular',
  4: 'Riesgoso',
  5: 'Muy riesgoso',
  6: 'Incobrable / Judicial',
};

const SCORE_STYLES: Record<CreditScore, string> = {
  1: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  2: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  3: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  4: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  5: 'bg-destructive/15 text-destructive',
  6: 'bg-destructive text-white',
};

export function scoreLabel(score: CreditScore | null): string {
  return score === null ? 'Sin historial' : `${score} · ${SCORE_LABELS[score]}`;
}

export function scoreStyle(score: CreditScore | null): string {
  return score === null
    ? 'bg-muted/40 text-muted-foreground'
    : SCORE_STYLES[score];
}

/** null = todavía no hay cuotas vencidas o pagadas para evaluar. */
export function formatDelay(days: number | null): string {
  if (days === null) return '—';
  if (days === 0) return 'Al día';
  const value = new Intl.NumberFormat('es-PY', {
    maximumFractionDigits: 1,
  }).format(days);
  return `${value} ${days === 1 ? 'día' : 'días'}`;
}

/**
 * Texto del rango de atraso promedio de cada nivel (1 a 5) a partir de los
 * límites superiores de los niveles 1 a 4.
 */
export function ratingRanges(thresholds: number[]): string[] {
  const ranges = thresholds.map((limit, level) => {
    if (level === 0) {
      return limit === 0 ? 'Sin atraso' : `Hasta ${limit} días`;
    }
    return `Más de ${thresholds[level - 1]} y hasta ${limit} días`;
  });
  return [...ranges, `Más de ${thresholds[thresholds.length - 1]} días`];
}

/** Mensaje de error de los límites, o null si son válidos. */
export function thresholdsError(thresholds: number[]): string | null {
  if (thresholds.some((limit) => !Number.isInteger(limit) || limit < 0)) {
    return 'Cada límite debe ser un número entero de días, cero o mayor';
  }
  if (thresholds.some((limit, i) => i > 0 && limit <= thresholds[i - 1])) {
    return 'Cada nivel debe admitir más días de atraso que el anterior';
  }
  return null;
}

/** Totales del historial para el resumen de la evaluación. */
export function historyTotals(history: CreditHistory) {
  const loans = [...history.activeLoans, ...history.finishedLoans];
  return {
    activeCount: history.activeLoans.length,
    finishedCount: history.finishedLoans.length,
    outstanding: history.activeLoans.reduce(
      (sum, loan) => sum + loan.outstandingBalance,
      0,
    ),
    lateInstallments: loans.reduce(
      (sum, loan) => sum + loan.lateInstallments,
      0,
    ),
    maxDelayDays: loans.reduce(
      (max, loan) => Math.max(max, loan.maxDelayDays),
      0,
    ),
  };
}
