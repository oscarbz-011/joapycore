// A quién va un presupuesto: un cliente registrado o una persona o empresa
// que todavía no es cliente, con sus datos cargados a mano. El servidor exige
// un cliente registrado recién al convertir el presupuesto en pedido.

/** Los datos cargados a mano, tal como se tipean. */
export interface ProspectForm {
  name: string;
  document: string;
  phone: string;
  email: string;
  address: string;
}

export function emptyProspect(): ProspectForm {
  return { name: '', document: '', phone: '', email: '', address: '' };
}

export interface ProspectPayload {
  name: string;
  document?: string;
  phone?: string;
  email?: string;
  address?: string;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Problema con los datos cargados a mano, o null si están bien. */
export function prospectError(form: ProspectForm): string | null {
  if (!form.name.trim()) return 'Ingresá el nombre o la razón social';
  if (form.email.trim() && !EMAIL.test(form.email.trim())) {
    return 'El email no tiene un formato válido';
  }
  return null;
}

const optional = (value: string) => value.trim() || undefined;

export function toProspectPayload(form: ProspectForm): ProspectPayload {
  return {
    name: form.name.trim(),
    document: optional(form.document),
    phone: optional(form.phone),
    email: optional(form.email),
    address: optional(form.address),
  };
}

/** Lo que un pedido trae sobre a quién va dirigido. */
export interface OrderPartySource {
  prospectName?: string | null;
  prospectDocument?: string | null;
  prospectPhone?: string | null;
  prospectEmail?: string | null;
  prospectAddress?: string | null;
  customer: {
    firstName: string;
    lastName: string;
    documentType?: string | null;
    documentNumber?: string | null;
  };
}

/** El presupuesto se hizo para alguien que todavía no es cliente. */
export function isProspectOrder(order: OrderPartySource): boolean {
  return !!order.prospectName;
}

export function orderPartyName(order: OrderPartySource): string {
  return (
    order.prospectName ||
    `${order.customer.firstName} ${order.customer.lastName}`.trim()
  );
}

/** "RUC: 80012345-6", o null si no hay documento. */
export function orderPartyDocument(order: OrderPartySource): string | null {
  if (isProspectOrder(order)) return order.prospectDocument || null;
  const { documentNumber, documentType } = order.customer;
  return documentNumber ? `${documentType ?? 'CI'}: ${documentNumber}` : null;
}

/** Datos para arrancar el alta de cliente con lo ya cargado en el presupuesto. */
export interface CustomerPrefill {
  firstName: string;
  lastName: string;
  documentNumber?: string;
  phone?: string;
  email?: string;
  address?: string;
}

/**
 * El nombre se cargó en un solo campo y el cliente lo lleva en dos: la
 * primera palabra va como nombre y el resto como apellido, para corregir en
 * el alta. Una sola palabra queda como nombre.
 */
export function customerPrefillFrom(order: OrderPartySource): CustomerPrefill {
  const words = (order.prospectName ?? '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: words[0] ?? '',
    lastName: words.slice(1).join(' '),
    documentNumber: order.prospectDocument || undefined,
    phone: order.prospectPhone || undefined,
    email: order.prospectEmail || undefined,
    address: order.prospectAddress || undefined,
  };
}

/** Claves de sessionStorage del ida y vuelta al alta de cliente. */
export const CUSTOMER_PREFILL_KEY = 'sales:new-customer-prefill';
/** La escribe el alta de cliente al volver a quien la pidió. */
export const NEW_CUSTOMER_ID_KEY = 'sales:new-order-draft-customer-id';

/**
 * Valor leído de sessionStorage al montar. La lectura borra la clave, y en
 * desarrollo React monta cada pantalla dos veces: la segunda lectura llega
 * vacía y no tiene que pisar lo que trajo la primera.
 * `undefined` = todavía no se leyó; `null` = se leyó y no había nada.
 */
export function keepFirstRead<T>(
  current: T | null | undefined,
  read: T | null,
): T | null {
  return current ?? read;
}
