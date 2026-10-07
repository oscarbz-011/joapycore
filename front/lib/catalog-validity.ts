import { formatDatePY } from './date';

// La vigencia de un precio son días de calendario (se guardan como medianoche
// UTC): se compara por día, no por instante.

export type ValidityStatus = 'open' | 'upcoming' | 'valid' | 'expiring' | 'expired';

export interface PriceValidity {
  status: ValidityStatus;
  /** Días hasta el último día de vigencia; negativo si ya venció. */
  daysLeft: number | null;
}

interface ValidityDates {
  validFrom: string | null;
  validTo: string | null;
}

/** Con esta anticipación se avisa que el precio está por vencer. */
export const EXPIRING_SOON_DAYS = 7;

const DAY_MS = 86_400_000;
const toDay = (iso: string) => Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);

/** `todayISO` es el día de hoy en Paraguay (ver localISODate). */
export function priceValidity(
  item: ValidityDates,
  todayISO: string,
): PriceValidity {
  const today = toDay(todayISO);
  const daysLeft = item.validTo
    ? Math.round((toDay(item.validTo) - today) / DAY_MS)
    : null;

  if (daysLeft !== null && daysLeft < 0) return { status: 'expired', daysLeft };
  if (item.validFrom && toDay(item.validFrom) > today) {
    return { status: 'upcoming', daysLeft };
  }
  if (daysLeft === null) {
    return { status: item.validFrom ? 'valid' : 'open', daysLeft };
  }
  return {
    status: daysLeft <= EXPIRING_SOON_DAYS ? 'expiring' : 'valid',
    daysLeft,
  };
}

export function validityLabel(item: ValidityDates, todayISO: string): string {
  const { status, daysLeft } = priceValidity(item, todayISO);
  if (status === 'upcoming') return `Rige desde ${formatDatePY(item.validFrom)}`;
  if (status === 'expired') return `Venció el ${formatDatePY(item.validTo)}`;
  if (daysLeft === null) return 'Sin vencimiento';
  if (status === 'valid') return `Hasta ${formatDatePY(item.validTo)}`;
  if (daysLeft === 0) return 'Vence hoy';
  if (daysLeft === 1) return 'Vence mañana';
  return `Vence en ${daysLeft} días`;
}

/** Fechas en formato AAAA-MM-DD; vacío = sin límite. */
export function validityRangeError(from: string, to: string): string | null {
  return from && to && to < from
    ? 'La vigencia no puede terminar antes de empezar'
    : null;
}
