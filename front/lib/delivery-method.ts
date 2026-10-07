// Cómo se entrega una venta lista para entregar: envío a domicilio, retiro en
// sucursal, o —excepcionalmente— a cargo del vendedor con autorización de un
// supervisor. Las reglas las valida el servidor; acá deciden qué se muestra.

export type DeliveryMethod = 'HOME_DELIVERY' | 'PICKUP' | 'SELLER';
export type SellerRequestStatus = 'PENDING' | 'AUTHORIZED' | 'REJECTED';

export const DELIVERY_METHOD_LABEL: Record<DeliveryMethod, string> = {
  HOME_DELIVERY: 'Envío a domicilio',
  PICKUP: 'Retiro en sucursal',
  SELLER: 'Lo lleva el vendedor',
};

/** Lo que hace falta saber de una entrega para decidir qué ofrecer. */
export interface DeliveryMethodState {
  status: 'PENDING' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED';
  method: DeliveryMethod;
  sellerRequestStatus: SellerRequestStatus | null;
  sellerRequestedBy: { id: string } | null;
  saleOrder: { seller: { id: string } | null };
}

export interface DeliveryViewer {
  userId: string;
  permissions: readonly string[];
}

export interface DeliveryMethodActions {
  /** Pasar a retiro en sucursal. */
  setPickup: boolean;
  /** Volver a envío a domicilio. */
  setHomeDelivery: boolean;
  /** Registrar que el cliente retiró. */
  registerPickup: boolean;
  /** El vendedor pide llevarlo en persona. */
  requestSeller: boolean;
  /** El supervisor autoriza o rechaza. */
  decideSeller: boolean;
  /** El vendedor autorizado marca entregado. */
  sellerDelivered: boolean;
}

export function deliveryMethodActions(
  note: DeliveryMethodState,
  viewer: DeliveryViewer,
): DeliveryMethodActions {
  const can = (permission: string) => viewer.permissions.includes(permission);
  const isSeller = note.saleOrder.seller?.id === viewer.userId;
  const pending = note.status === 'PENDING';
  const requestOpen =
    note.sellerRequestStatus === 'PENDING' ||
    note.sellerRequestStatus === 'AUTHORIZED';
  const choosesMethod = can('logistics:assign') || isSeller;

  return {
    setPickup: pending && note.method !== 'PICKUP' && choosesMethod,
    setHomeDelivery: pending && note.method !== 'HOME_DELIVERY' && choosesMethod,
    registerPickup:
      pending &&
      note.method === 'PICKUP' &&
      (can('logistics:manage') || isSeller),
    requestSeller: pending && isSeller && !requestOpen,
    // La autorización es de un supervisor: nunca de quien lo pidió.
    decideSeller:
      pending &&
      note.sellerRequestStatus === 'PENDING' &&
      can('logistics:authorize') &&
      note.sellerRequestedBy?.id !== viewer.userId,
    sellerDelivered:
      note.method === 'SELLER' &&
      note.sellerRequestStatus === 'AUTHORIZED' &&
      (note.status === 'PENDING' || note.status === 'DISPATCHED') &&
      (note.sellerRequestedBy?.id === viewer.userId || can('logistics:manage')),
  };
}

/** Solo un envío a domicilio se asigna a un repartidor y se despacha. */
export function usesCourier(note: { method: DeliveryMethod }): boolean {
  return note.method === 'HOME_DELIVERY';
}

/** En qué está la entrega, en una frase, según su método. */
export function deliveryMethodSummary(note: {
  status: DeliveryMethodState['status'];
  method: DeliveryMethod;
  sellerRequestStatus: SellerRequestStatus | null;
  pickedUpByName?: string | null;
}): string {
  const closed = note.status === 'DELIVERED';
  if (note.method === 'PICKUP') {
    return closed
      ? `Retirado en sucursal${note.pickedUpByName ? ` por ${note.pickedUpByName}` : ''}`
      : 'Esperando que el cliente lo retire en la sucursal';
  }
  if (note.method === 'SELLER') {
    if (closed) return 'Entregado por el vendedor';
    return note.sellerRequestStatus === 'AUTHORIZED'
      ? 'Autorizado: lo lleva el vendedor'
      : 'El vendedor pidió llevarlo: falta la autorización del supervisor';
  }
  if (note.sellerRequestStatus === 'REJECTED' && !closed) {
    return 'No se autorizó que lo lleve el vendedor: va por envío a domicilio';
  }
  return closed ? 'Entregado a domicilio' : 'Se envía a la dirección del cliente';
}

/** Problema con los datos del retiro, o null si están bien. */
export function pickupError(receivedByName: string): string | null {
  return receivedByName.trim() ? null : 'Ingresá quién retiró el pedido';
}

/** Problema al rechazar el pedido del vendedor, o null si está bien. */
export function rejectionError(reason: string): string | null {
  return reason.trim() ? null : 'Indicá por qué no se autoriza';
}
