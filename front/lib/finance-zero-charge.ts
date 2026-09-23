export function zeroChargeNotice({
  graceDays,
  hasMoraComponents,
  overdueDays,
}: {
  graceDays: number;
  hasMoraComponents: boolean;
  overdueDays: number[];
}): string {
  if (!hasMoraComponents) {
    return 'Hay cuotas vencidas, pero no existen recargos moratorios activos en la configuración de crédito.';
  }
  if (
    graceDays > 0 &&
    overdueDays.length > 0 &&
    overdueDays.every((days) => days <= graceDays)
  ) {
    return `Hay cuotas vencidas dentro del período de tolerancia de ${graceDays} días. Los intereses moratorios se aplicarán cuando finalice ese plazo.`;
  }
  return 'Hay cuotas vencidas sin recargos pendientes en este momento.';
}
