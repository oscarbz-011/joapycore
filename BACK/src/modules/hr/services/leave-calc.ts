// Cálculos puros de licencias (sin acceso a datos). Fechas como días de
// calendario en UTC, igual que el resto de fechas de vencimiento del sistema.

const DAY_MS = 86_400_000;

/**
 * Días hábiles entre dos fechas, ambas inclusive. En Paraguay la semana
 * laboral es de lunes a sábado (Código del Trabajo), así que solo se descuenta
 * el domingo. Los feriados no se descuentan: el saldo es editable para esos
 * ajustes.
 */
export function businessDaysBetween(start: Date, end: Date): number {
  const from = Date.UTC(
    start.getUTCFullYear(),
    start.getUTCMonth(),
    start.getUTCDate(),
  );
  const to = Date.UTC(
    end.getUTCFullYear(),
    end.getUTCMonth(),
    end.getUTCDate(),
  );
  if (to < from) return 0;
  let days = 0;
  for (let t = from; t <= to; t += DAY_MS) {
    if (new Date(t).getUTCDay() !== 0) days++;
  }
  return days;
}

/**
 * Vacaciones anuales según antigüedad (Código del Trabajo de Paraguay, art.
 * 218): hasta 5 años, 12 días hábiles; más de 5 y hasta 10, 18; más de 10, 30.
 * El derecho nace al cumplir el primer año. Se toma la antigüedad al cierre del
 * año del saldo, porque el aniversario puede caer en cualquier mes.
 */
export function legalVacationDays(hireDate: Date, year: number): number {
  const endOfYear = new Date(Date.UTC(year, 11, 31));
  let years = endOfYear.getUTCFullYear() - hireDate.getUTCFullYear();
  const anniversaryPassed =
    endOfYear.getUTCMonth() > hireDate.getUTCMonth() ||
    (endOfYear.getUTCMonth() === hireDate.getUTCMonth() &&
      endOfYear.getUTCDate() >= hireDate.getUTCDate());
  if (!anniversaryPassed) years--;
  if (years < 1) return 0;
  if (years <= 5) return 12;
  if (years <= 10) return 18;
  return 30;
}
