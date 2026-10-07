import { describe, expect, it } from 'vitest';
import {
  deliveryMethodActions,
  deliveryMethodSummary,
  pickupConfirmation,
  rejectionError,
  usesCourier,
  type DeliveryMethodState,
} from './delivery-method';

const note = (overrides: Partial<DeliveryMethodState> = {}): DeliveryMethodState => ({
  status: 'PENDING',
  method: 'HOME_DELIVERY',
  sellerRequestStatus: null,
  sellerRequestedBy: null,
  saleOrder: { seller: { id: 'seller-1' } },
  ...overrides,
});

const seller = { userId: 'seller-1', permissions: ['sales:read'] };
const otherSeller = { userId: 'seller-2', permissions: ['sales:read'] };
const dispatcher = {
  userId: 'disp-1',
  permissions: ['logistics:read', 'logistics:assign', 'logistics:manage'],
};
const supervisor = { userId: 'sup-1', permissions: ['logistics:authorize'] };

const requested = () =>
  note({
    method: 'SELLER',
    sellerRequestStatus: 'PENDING',
    sellerRequestedBy: { id: 'seller-1' },
  });
const authorized = () =>
  note({
    method: 'SELLER',
    sellerRequestStatus: 'AUTHORIZED',
    sellerRequestedBy: { id: 'seller-1' },
  });

describe('choosing how a sale is delivered', () => {
  it('lets the seller and logistics switch to pickup at the branch', () => {
    expect(deliveryMethodActions(note(), seller).setPickup).toBe(true);
    expect(deliveryMethodActions(note(), dispatcher).setPickup).toBe(true);
    expect(deliveryMethodActions(note(), otherSeller).setPickup).toBe(false);
  });

  it('offers going back to home delivery only from another method', () => {
    expect(deliveryMethodActions(note(), seller).setHomeDelivery).toBe(false);
    expect(
      deliveryMethodActions(note({ method: 'PICKUP' }), seller).setHomeDelivery,
    ).toBe(true);
  });

  it('offers nothing once the delivery left or closed', () => {
    for (const status of ['DISPATCHED', 'DELIVERED', 'CANCELLED'] as const) {
      const actions = deliveryMethodActions(note({ status }), seller);
      expect(actions.setPickup).toBe(false);
      expect(actions.requestSeller).toBe(false);
    }
  });

  it('assigns a courier only to a home delivery', () => {
    expect(usesCourier(note())).toBe(true);
    expect(usesCourier(note({ method: 'PICKUP' }))).toBe(false);
    expect(usesCourier(note({ method: 'SELLER' }))).toBe(false);
  });
});

describe('pickup at the branch', () => {
  const pickup = note({ method: 'PICKUP' });

  it('is registered by logistics or by the seller of the order', () => {
    expect(deliveryMethodActions(pickup, seller).registerPickup).toBe(true);
    expect(deliveryMethodActions(pickup, dispatcher).registerPickup).toBe(true);
    expect(deliveryMethodActions(pickup, otherSeller).registerPickup).toBe(false);
  });

  it('is not offered on a delivery that is not a pickup', () => {
    expect(deliveryMethodActions(note(), seller).registerPickup).toBe(false);
  });

  // Retira siempre el cliente de la venta: se confirma, no se elige.
  it('asks to check that it is the customer of the sale', () => {
    expect(
      pickupConfirmation({
        firstName: 'María',
        lastName: 'González',
        documentType: 'CI',
        documentNumber: '4557744',
      }),
    ).toBe(
      'El pedido lo retira el cliente de la venta: María González (CI: 4557744). Comprobá que sea él antes de entregarlo.',
    );
  });

  it('leaves the document out when the customer has none', () => {
    expect(
      pickupConfirmation({ firstName: 'María', lastName: 'González' }),
    ).toMatch(/María González\. Comprobá/);
  });
});

describe('seller delivering in person', () => {
  it('can be asked only by the seller of that order', () => {
    expect(deliveryMethodActions(note(), seller).requestSeller).toBe(true);
    expect(deliveryMethodActions(note(), otherSeller).requestSeller).toBe(false);
    expect(deliveryMethodActions(note(), dispatcher).requestSeller).toBe(false);
  });

  it('is not asked twice, but can be asked again after a rejection', () => {
    expect(deliveryMethodActions(requested(), seller).requestSeller).toBe(false);
    expect(deliveryMethodActions(authorized(), seller).requestSeller).toBe(false);
    expect(
      deliveryMethodActions(note({ sellerRequestStatus: 'REJECTED' }), seller)
        .requestSeller,
    ).toBe(true);
  });

  it('is decided by a supervisor', () => {
    expect(deliveryMethodActions(requested(), supervisor).decideSeller).toBe(true);
    expect(deliveryMethodActions(requested(), dispatcher).decideSeller).toBe(false);
    expect(deliveryMethodActions(note(), supervisor).decideSeller).toBe(false);
  });

  // Aunque el vendedor tenga el permiso, no decide su propio pedido.
  it('is never decided by the seller who asked', () => {
    const sellerSupervisor = {
      userId: 'seller-1',
      permissions: ['logistics:authorize'],
    };
    expect(deliveryMethodActions(requested(), sellerSupervisor).decideSeller).toBe(
      false,
    );
  });

  it('is closed by the seller only after it is authorized', () => {
    expect(deliveryMethodActions(requested(), seller).sellerDelivered).toBe(false);
    expect(deliveryMethodActions(authorized(), seller).sellerDelivered).toBe(true);
    expect(deliveryMethodActions(authorized(), otherSeller).sellerDelivered).toBe(
      false,
    );
  });

  it('asks for a reason to reject', () => {
    expect(rejectionError(' ')).toMatch(/por qué/);
    expect(rejectionError('Pedido demasiado grande')).toBeNull();
  });
});

describe('deliveryMethodSummary', () => {
  it('says where each kind of delivery stands', () => {
    expect(deliveryMethodSummary(note())).toBe(
      'Se envía a la dirección del cliente',
    );
    expect(deliveryMethodSummary(note({ method: 'PICKUP' }))).toBe(
      'Esperando que el cliente lo retire en la sucursal',
    );
    expect(deliveryMethodSummary(requested())).toMatch(/falta la autorización/);
    expect(deliveryMethodSummary(authorized())).toBe(
      'Autorizado: lo lleva el vendedor',
    );
  });

  it('says who picked the order up once closed', () => {
    expect(
      deliveryMethodSummary({
        ...note({ method: 'PICKUP', status: 'DELIVERED' }),
        pickedUpByName: 'María González',
      }),
    ).toBe('Retirado en sucursal por María González');
  });

  it('explains a rejected request', () => {
    expect(
      deliveryMethodSummary(note({ sellerRequestStatus: 'REJECTED' })),
    ).toMatch(/No se autorizó/);
  });
});
