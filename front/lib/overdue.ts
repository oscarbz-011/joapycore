// Días corridos desde una fecha de vencimiento (positivo = vencida).
// Función de módulo a propósito, no un hook ni algo que viva dentro de un
// componente — llamar Date.now() directo en el cuerpo de un componente
// dispara el lint de pureza de React (react-hooks/purity).
export function daysOverdue(dueDate: string): number {
  return Math.floor((Date.now() - new Date(dueDate).getTime()) / 86_400_000);
}
