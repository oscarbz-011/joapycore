// Zona horaria del negocio. Los procesos programados y la noción de "hoy" se
// anclan acá, no a la zona del proceso: en un contenedor en UTC la medianoche
// del servidor son las 20/21 h de Paraguay.
export const BUSINESS_TIMEZONE = 'America/Asuncion';

/**
 * "Hoy" en la zona del negocio, como medianoche UTC de ese día calendario:
 * el mismo formato con que se guardan las fechas de vencimiento (días de
 * calendario, no instantes). Una cuota vence el día D y sigue en término todo
 * ese día; recién está vencida si `dueDate < startOfBusinessDay()`.
 */
export function startOfBusinessDay(
  now: Date = new Date(),
  timeZone: string = BUSINESS_TIMEZONE,
): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
}
