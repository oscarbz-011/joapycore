// El backend guarda solo el día y lo devuelve como medianoche UTC ("1990-05-20T00:00:00.000Z").
export function birthDateFromCustomer(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : '';
}

// null borra la fecha al editar; una persona jurídica no la tiene.
export function birthDateForPayload(value: string | null | undefined, company: boolean): string | null {
  if (company) return null;
  return value || null;
}
