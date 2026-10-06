interface PendingRequest {
  orderDate: string;
  creditViewedAt?: string | null;
}

/** Una solicitud es nueva hasta que un analista abre su evaluación. */
export function isNewRequest(order: PendingRequest): boolean {
  return !order.creditViewedAt;
}

/** Bandeja del analista: primero las que nadie revisó, y dentro de cada grupo las más recientes. */
export function sortPendingRequests<T extends PendingRequest>(
  orders: readonly T[],
): T[] {
  return [...orders].sort(
    (a, b) =>
      Number(isNewRequest(b)) - Number(isNewRequest(a)) ||
      b.orderDate.localeCompare(a.orderDate),
  );
}
