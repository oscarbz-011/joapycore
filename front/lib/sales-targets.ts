import type { SellerStat } from './api/sales';

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export const fmtGs = (n: number) => `Gs. ${new Intl.NumberFormat('es-PY').format(Math.round(n))}`;

/** "octubre de 2026" */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  return `${MONTHS[month - 1]} de ${year}`;
}

export function addMonths(period: string, delta: number): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Cuánto del mes ya pasó, hasta hoy inclusive: 0 si es futuro, 1 si ya terminó. */
export interface MonthProgress {
  /** Días transcurridos (hoy cuenta). */
  elapsed: number;
  days: number;
  /** Días que quedan, hoy incluido. */
  left: number;
  fraction: number;
}

export function monthProgress(period: string, today: string): MonthProgress {
  const [year, month] = period.split('-').map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const current = today.slice(0, 7);
  const elapsed = period < current ? days : period > current ? 0 : Number(today.slice(8, 10));
  return { elapsed, days, left: days - elapsed + (period === current ? 1 : 0), fraction: elapsed / days };
}

/** Sin tope: superar la meta se tiene que ver. */
export function percentOf(actual: number, target: number | null): number | null {
  if (!target || target <= 0) return null;
  return Math.round((actual / target) * 100);
}

export type GoalStatus = 'none' | 'achieved' | 'on-track' | 'behind' | 'missed' | 'upcoming';

// Un 10 % de margen: unos días sin ventas no son todavía un atraso.
const PACE_TOLERANCE = 0.9;

export function goalStatus(actual: number, target: number | null, progress: MonthProgress): GoalStatus {
  if (!target || target <= 0) return 'none';
  if (actual >= target) return 'achieved';
  if (progress.fraction >= 1) return 'missed';
  if (progress.elapsed === 0) return 'upcoming';
  return actual / target >= progress.fraction * PACE_TOLERANCE ? 'on-track' : 'behind';
}

export const STATUS: Record<GoalStatus, { label: string; color: string }> = {
  achieved: { label: 'Meta cumplida', color: 'var(--accent-text)' },
  'on-track': { label: 'En ritmo', color: 'var(--info)' },
  behind: { label: 'Atrasado', color: 'var(--warn)' },
  missed: { label: 'No se cumplió', color: 'var(--danger)' },
  upcoming: { label: 'Todavía no empezó', color: 'var(--muted-foreground)' },
  none: { label: 'Sin meta', color: 'var(--muted-foreground)' },
};

/** Lo que falta o lo que se pasó de la meta. */
export function gap(actual: number, target: number | null): { kind: 'missing' | 'exceeded'; amount: number } | null {
  if (!target || target <= 0) return null;
  return actual >= target
    ? { kind: 'exceeded', amount: actual - target }
    : { kind: 'missing', amount: target - actual };
}

/** Lo que habría que vender por día, desde hoy, para llegar. */
export function dailyNeeded(actual: number, target: number | null, progress: MonthProgress): number | null {
  if (!target || actual >= target || progress.left <= 0 || progress.fraction >= 1) return null;
  return (target - actual) / progress.left;
}

export interface SellerRow extends SellerStat {
  name: string;
  percent: number | null;
  status: GoalStatus;
  /** Positivo = falta, negativo = se pasó. */
  remaining: number | null;
  /** Puesto por lo vendido. */
  rank: number;
}

export function sellerRows(sellers: SellerStat[], progress: MonthProgress): SellerRow[] {
  const byAmount = [...sellers].sort((a, b) => b.actual - a.actual);
  return byAmount.map((stat, index) => ({
    ...stat,
    name: `${stat.seller.firstName} ${stat.seller.lastName}`.trim(),
    percent: percentOf(stat.actual, stat.target),
    status: goalStatus(stat.actual, stat.target, progress),
    remaining: stat.target ? stat.target - stat.actual : null,
    rank: index + 1,
  }));
}

/** Cuántos vendedores hay en cada situación. */
export function statusCounts(rows: SellerRow[]): Partial<Record<GoalStatus, number>> {
  const counts: Partial<Record<GoalStatus, number>> = {};
  for (const row of rows) counts[row.status] = (counts[row.status] ?? 0) + 1;
  return counts;
}
