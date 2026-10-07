import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeliveryMethodsService } from './delivery-methods.service';

function makeNote(overrides = {}) {
  return {
    id: 'note-1',
    tenantId: 'tenant-1',
    status: 'PENDING',
    method: 'HOME_DELIVERY',
    assignmentMode: null as string | null,
    assignedEmployeeId: null as string | null,
    sellerRequestStatus: null as string | null,
    sellerRequestedById: null as string | null,
    saleOrder: { id: 'order-1', sellerId: 'seller-1', customerId: 'cust-1' },
    ...overrides,
  };
}

// Quién actúa.
const seller = { userId: 'seller-1', permissions: ['sales:read'] };
const otherSeller = { userId: 'seller-2', permissions: ['sales:read'] };
const dispatcher = {
  userId: 'disp-1',
  permissions: ['logistics:read', 'logistics:assign', 'logistics:manage'],
};
const sellerEmployee = { id: 'emp-1', firstName: 'Ana', lastName: 'Gómez' };

describe('DeliveryMethodsService', () => {
  let service: DeliveryMethodsService;
  let notes: {
    findById: jest.Mock;
    findBySaleOrder: jest.Mock;
    patch: jest.Mock;
  };
  let sources: { findEmployeeByUser: jest.Mock };
  let trackingEvents: { create: jest.Mock };
  let deliveryNotesService: { complete: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    notes = {
      findById: jest.fn().mockResolvedValue(makeNote()),
      findBySaleOrder: jest.fn().mockResolvedValue(makeNote()),
      patch: jest.fn().mockResolvedValue({ count: 1 }),
    };
    sources = {
      findEmployeeByUser: jest.fn().mockResolvedValue(sellerEmployee),
    };
    trackingEvents = { create: jest.fn() };
    deliveryNotesService = {
      complete: jest.fn().mockResolvedValue({ status: 'DELIVERED' }),
    };
    eventEmitter = { emit: jest.fn() };
    service = new DeliveryMethodsService(
      notes as never,
      sources as never,
      trackingEvents as never,
      deliveryNotesService as never,
      eventEmitter as never,
    );
  });

  const patched = () =>
    notes.patch.mock.calls[0] as [
      string,
      string,
      object,
      Record<string, unknown>,
    ];

  describe('findForOrder', () => {
    it('shows the delivery to logistics and to the seller of the order', async () => {
      await expect(
        service.findForOrder('tenant-1', 'order-1', dispatcher),
      ).resolves.toBeDefined();
      await expect(
        service.findForOrder('tenant-1', 'order-1', seller),
      ).resolves.toBeDefined();
      expect(notes.findBySaleOrder).toHaveBeenCalledWith('tenant-1', 'order-1');
    });

    it('does not show it to another seller', async () => {
      await expect(
        service.findForOrder('tenant-1', 'order-1', otherSeller),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not reveal an order of another tenant', async () => {
      notes.findBySaleOrder.mockResolvedValue(null);

      await expect(
        service.findForOrder('tenant-2', 'order-1', dispatcher),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── Retiro en sucursal ───────────────────────────────────────────────────

  describe('pickup at the branch', () => {
    it('lets the seller mark that the customer picks it up', async () => {
      await service.setMethod(
        'tenant-1',
        'note-1',
        { method: 'PICKUP' },
        seller,
      );

      const [tenantId, id, whileIs, data] = patched();
      expect([tenantId, id]).toEqual(['tenant-1', 'note-1']);
      expect(whileIs).toEqual({ status: 'PENDING' });
      // Sin repartidor: se limpia cualquier asignación previa.
      expect(data).toMatchObject({
        method: 'PICKUP',
        assignmentMode: null,
        assignedEmployeeId: null,
        sellerRequestStatus: null,
      });
    });

    it('lets logistics switch it back to home delivery', async () => {
      notes.findById.mockResolvedValue(makeNote({ method: 'PICKUP' }));

      await service.setMethod(
        'tenant-1',
        'note-1',
        { method: 'HOME_DELIVERY' },
        dispatcher,
      );

      expect(patched()[3]).toMatchObject({ method: 'HOME_DELIVERY' });
    });

    it('refuses someone who is neither logistics nor the seller', async () => {
      await expect(
        service.setMethod(
          'tenant-1',
          'note-1',
          { method: 'PICKUP' },
          otherSeller,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(notes.patch).not.toHaveBeenCalled();
    });

    it('cannot change once the delivery is on its way or closed', async () => {
      notes.findById.mockResolvedValue(makeNote({ status: 'DISPATCHED' }));

      await expect(
        service.setMethod(
          'tenant-1',
          'note-1',
          { method: 'PICKUP' },
          dispatcher,
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('closes the delivery recording who took the order', async () => {
      notes.findById.mockResolvedValue(makeNote({ method: 'PICKUP' }));

      await service.registerPickup(
        'tenant-1',
        'note-1',
        { receivedByName: ' Juan Pérez ', receivedByDocument: '1234567' },
        seller,
      );

      expect(patched()[2]).toEqual({ status: 'PENDING', method: 'PICKUP' });
      expect(patched()[3]).toEqual({
        pickedUpByName: 'Juan Pérez',
        pickedUpByDocument: '1234567',
      });
      // Sin despacho: se cierra desde pendiente y descuenta stock.
      expect(deliveryNotesService.complete).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        'seller-1',
      );
    });

    it('does not register a pickup on a delivery that is not a pickup', async () => {
      await expect(
        service.registerPickup(
          'tenant-1',
          'note-1',
          { receivedByName: 'Juan Pérez' },
          dispatcher,
        ),
      ).rejects.toThrow(/retiro en sucursal/);
      expect(deliveryNotesService.complete).not.toHaveBeenCalled();
    });
  });

  // ── Entrega a cargo del vendedor ─────────────────────────────────────────

  describe('seller asks to deliver in person', () => {
    it('leaves the request waiting for a supervisor', async () => {
      await service.requestSellerDelivery(
        'tenant-1',
        'note-1',
        { note: 'Es vecino mío' },
        seller,
      );

      expect(patched()[3]).toMatchObject({
        method: 'SELLER',
        sellerRequestStatus: 'PENDING',
        sellerRequestNote: 'Es vecino mío',
        sellerRequestedById: 'seller-1',
        // Todavía no está asignada a nadie.
        assignmentMode: null,
        assignedEmployeeId: null,
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'delivery.seller.requested',
        { tenantId: 'tenant-1', deliveryNoteId: 'note-1' },
      );
    });

    it('is only for the seller of that order', async () => {
      await expect(
        service.requestSellerDelivery('tenant-1', 'note-1', {}, otherSeller),
      ).rejects.toBeInstanceOf(ForbiddenException);
      // Tampoco logística puede pedirlo en nombre del vendedor.
      await expect(
        service.requestSellerDelivery('tenant-1', 'note-1', {}, dispatcher),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // La entrega queda a nombre de un empleado.
    it('needs the seller to be linked to an employee', async () => {
      sources.findEmployeeByUser.mockResolvedValue(null);

      await expect(
        service.requestSellerDelivery('tenant-1', 'note-1', {}, seller),
      ).rejects.toThrow(/vinculado a un empleado/);
      expect(notes.patch).not.toHaveBeenCalled();
    });

    it.each(['PENDING', 'AUTHORIZED'])(
      'does not ask twice while the request is %s',
      async (sellerRequestStatus) => {
        notes.findById.mockResolvedValue(
          makeNote({ method: 'SELLER', sellerRequestStatus }),
        );

        await expect(
          service.requestSellerDelivery('tenant-1', 'note-1', {}, seller),
        ).rejects.toBeInstanceOf(UnprocessableEntityException);
      },
    );

    it('can ask again after a rejection', async () => {
      notes.findById.mockResolvedValue(
        makeNote({ sellerRequestStatus: 'REJECTED' }),
      );

      await service.requestSellerDelivery('tenant-1', 'note-1', {}, seller);

      expect(patched()[3]).toMatchObject({ sellerRequestStatus: 'PENDING' });
    });
  });

  describe('supervisor decides', () => {
    const requested = () =>
      makeNote({
        method: 'SELLER',
        sellerRequestStatus: 'PENDING',
        sellerRequestedById: 'seller-1',
      });

    beforeEach(() => notes.findById.mockResolvedValue(requested()));

    it('authorizing assigns the delivery to the seller', async () => {
      await service.authorizeSellerDelivery(
        'tenant-1',
        'note-1',
        { note: 'Ok' },
        'supervisor-1',
      );

      expect(sources.findEmployeeByUser).toHaveBeenCalledWith(
        'tenant-1',
        'seller-1',
      );
      expect(patched()[2]).toEqual({
        status: 'PENDING',
        sellerRequestStatus: 'PENDING',
      });
      expect(patched()[3]).toMatchObject({
        sellerRequestStatus: 'AUTHORIZED',
        sellerDecidedById: 'supervisor-1',
        sellerDecisionNote: 'Ok',
        assignmentMode: 'INTERNAL_EMPLOYEE',
        assignedEmployeeId: 'emp-1',
        carrier: 'Ana Gómez',
      });
    });

    // La autorización es de un supervisor, no del propio vendedor.
    it('cannot be decided by the seller who asked, even with the permission', async () => {
      await expect(
        service.authorizeSellerDelivery('tenant-1', 'note-1', {}, 'seller-1'),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        service.rejectSellerDelivery(
          'tenant-1',
          'note-1',
          { note: 'No' },
          'seller-1',
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(notes.patch).not.toHaveBeenCalled();
    });

    it('rejecting sends it back to an ordinary, unassigned delivery', async () => {
      await service.rejectSellerDelivery(
        'tenant-1',
        'note-1',
        { note: ' Pedido demasiado grande ' },
        'supervisor-1',
      );

      expect(patched()[3]).toMatchObject({
        method: 'HOME_DELIVERY',
        sellerRequestStatus: 'REJECTED',
        sellerDecisionNote: 'Pedido demasiado grande',
      });
    });

    it('asks for a reason to reject', async () => {
      await expect(
        service.rejectSellerDelivery('tenant-1', 'note-1', {}, 'supervisor-1'),
      ).rejects.toThrow(/por qué/);
    });

    it('has nothing to decide without a pending request', async () => {
      notes.findById.mockResolvedValue(makeNote());

      await expect(
        service.authorizeSellerDelivery(
          'tenant-1',
          'note-1',
          {},
          'supervisor-1',
        ),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('reports a conflict when someone else decided first', async () => {
      notes.patch.mockResolvedValue({ count: 0 });

      await expect(
        service.authorizeSellerDelivery(
          'tenant-1',
          'note-1',
          {},
          'supervisor-1',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('seller marks it delivered', () => {
    const authorized = (overrides = {}) =>
      makeNote({
        method: 'SELLER',
        sellerRequestStatus: 'AUTHORIZED',
        sellerRequestedById: 'seller-1',
        assignedEmployeeId: 'emp-1',
        ...overrides,
      });

    it('closes the delivery without the courier permission', async () => {
      notes.findById.mockResolvedValue(authorized());

      await service.markSellerDelivered('tenant-1', 'note-1', {}, seller);

      expect(trackingEvents.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          deliveryNoteId: 'note-1',
          checkpoint: 'DELIVERED',
          recordedById: 'seller-1',
        }),
      );
      expect(deliveryNotesService.complete).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        'seller-1',
      );
    });

    // Hoy no se exige, pero si manda la ubicación queda guardada.
    it('keeps the location when the seller sends one', async () => {
      notes.findById.mockResolvedValue(authorized());

      await service.markSellerDelivered(
        'tenant-1',
        'note-1',
        { latitude: -27.33, longitude: -55.86 },
        seller,
      );

      expect(trackingEvents.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ latitude: -27.33, longitude: -55.86 }),
      );
    });

    it('is refused before the supervisor authorizes', async () => {
      notes.findById.mockResolvedValue(
        authorized({
          sellerRequestStatus: 'PENDING',
          assignedEmployeeId: null,
        }),
      );

      await expect(
        service.markSellerDelivered('tenant-1', 'note-1', {}, seller),
      ).rejects.toThrow(/no está autorizada/);
      expect(deliveryNotesService.complete).not.toHaveBeenCalled();
    });

    it('is refused to anyone but the authorized seller', async () => {
      notes.findById.mockResolvedValue(authorized());
      sources.findEmployeeByUser.mockResolvedValue({ id: 'emp-2' });

      await expect(
        service.markSellerDelivered('tenant-1', 'note-1', {}, otherSeller),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(deliveryNotesService.complete).not.toHaveBeenCalled();
    });
  });
});
