import { localISODate, parseISODate, toISODate } from './date';

const DAY_MS = 86_400_000;

// Días corridos desde una fecha de vencimiento: positivo = vencida, 0 = vence
// hoy, negativo = faltan días.
//
// Un vencimiento es un día de calendario guardado a medianoche UTC, y "hoy" es
// el día en Paraguay. Se comparan días, no instantes: restando instantes, a
// partir de las 21:00 de Paraguay (00:00 UTC del día siguiente) una cuenta que
// vence hoy ya figuraba con un día de mora.
//
// Función de módulo a propósito, no un hook ni algo que viva dentro de un
// componente — llamar new Date() directo en el cuerpo de un componente
// dispara el lint de pureza de React (react-hooks/purity).
export function daysOverdue(dueDate: string, now: Date = new Date()): number {
  const due = parseISODate(toISODate(new Date(dueDate)));
  const today = parseISODate(localISODate(now));
  if (!due || !today || Number.isNaN(due.getTime())) return 0;
  return Math.round((today.getTime() - due.getTime()) / DAY_MS);
}
