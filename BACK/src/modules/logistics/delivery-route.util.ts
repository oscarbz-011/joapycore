// Reglas puras de la planificación de rutas de entrega.

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Un día de calendario ("2026-10-08") como medianoche UTC, que es como se
 * guardan las fechas de ruta. Null si no es un día que exista.
 */
export function parseRouteDay(value: string): Date | null {
  const match = DAY.exec(value);
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  const exists =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return exists ? date : null;
}

/**
 * Las paradas de una ruta con `id` puesta en `position` (0 = primera). Sin
 * posición, o con una fuera de rango, va al final. Si ya estaba en la ruta se
 * mueve, no se duplica.
 */
export function placeStop(
  ids: string[],
  id: string,
  position?: number,
): string[] {
  const others = ids.filter((other) => other !== id);
  const index =
    position === undefined || position < 0 || position > others.length
      ? others.length
      : Math.floor(position);
  return [...others.slice(0, index), id, ...others.slice(index)];
}

/** El orden nuevo nombra exactamente las mismas paradas, una vez cada una. */
export function isSameStops(current: string[], proposed: string[]): boolean {
  if (current.length !== proposed.length) return false;
  const seen = new Set(proposed);
  return seen.size === proposed.length && current.every((id) => seen.has(id));
}

const ROUTE_CODE = /^RUT-\d{2}-(\d+)$/;

/**
 * El código de la ruta siguiente: "RUT-26-000001", correlativo por empresa.
 * El número no se reinicia con el año, igual que el código de cliente.
 */
export function nextRouteCode(lastCode: string | null, now: Date): string {
  const year = String(now.getUTCFullYear()).slice(-2);
  const last = lastCode ? ROUTE_CODE.exec(lastCode) : null;
  const next = last ? Number(last[1]) + 1 : 1;
  return `RUT-${year}-${String(next).padStart(6, '0')}`;
}

/** Por qué no se pudo entregar una parada. */
export const FAILURE_REASONS = {
  ABSENT: 'No había nadie para recibir',
  WRONG_ADDRESS: 'La dirección es incorrecta',
  REJECTED: 'El cliente rechazó el pedido',
  OTHER: 'Otro motivo',
} as const;

export type FailureReason = keyof typeof FAILURE_REASONS;
