import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeliveryNotesService } from './delivery-notes.service';
import { LogisticsSourcesRepository } from '../repositories/logistics-sources.repository';

function makeNote(overrides = {}) {
  return {
    id: 'note-1',
    tenantId: 'tenant-1',
    saleOrderId: 'order-1',
    status: 'PENDING' as const,
    method: 'HOME_DELIVERY' as string,
    assignmentMode: null as string | null,
    assignedEmployeeId: null,
    carrier: null,
    vehicle: null,
    saleOrder: { id: 'order-1' },
    ...overrides,
  };
}

const MANAGE = ['logistics:manage'];

describe('DeliveryNotesService', () => {
  let service: DeliveryNotesService;
  let repo: {
    findById: jest.Mock;
    findAll: jest.Mock;
    update: jest.Mock;
    close: jest.Mock;
    ensurePendingForOrder: jest.Mock;
    closeDeliveredOutsideLogistics: jest.Mock;
  };
  let eventEmitter: { emit: jest.Mock };
  let prisma: {
    employee: { findUnique: jest.Mock };
    saleOrder: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let outbox: { enqueue: jest.Mock; dispatch: jest.Mock };
  const tx = { tx: true };

  beforeEach(() => {
    repo = {
      findById: jest.fn(),
      findAll: jest.fn(),
      update: jest.fn(),
      close: jest.fn().mockResolvedValue(1),
      ensurePendingForOrder: jest
        .fn()
        .mockResolvedValue({ id: 'note-new', created: true }),
      closeDeliveredOutsideLogistics: jest.fn().mockResolvedValue(0),
    };
    eventEmitter = { emit: jest.fn() };
    prisma = {
      employee: { findUnique: jest.fn() },
      saleOrder: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn().mockImplementation((cb) => cb(tx)),
    };
    outbox = {
      enqueue: jest.fn().mockResolvedValue('evt-1'),
      dispatch: jest.fn().mockResolvedValue(true),
    };
    service = new DeliveryNotesService(
      repo as any,
      eventEmitter as any,
      new LogisticsSourcesRepository(prisma as any),
      prisma as any,
      outbox as any,
    );
  });

  describe('findOne', () => {
    it('throws NotFoundException when the note does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.findOne('tenant-1', 'ghost')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('dispatch', () => {
    it('rejects a note that is not PENDING', async () => {
      repo.findById.mockResolvedValue(
        makeNote({ status: 'DISPATCHED', assignmentMode: 'INTERNAL_EMPLOYEE' }),
      );

      await expect(
        service.dispatch('tenant-1', 'note-1', {}, 'user-1', MANAGE),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects a note that has not been assigned yet', async () => {
      repo.findById.mockResolvedValue(makeNote({ assignmentMode: null }));

      await expect(
        service.dispatch('tenant-1', 'note-1', {}, 'user-1', MANAGE),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('dispatches an assigned PENDING note (logistics:manage)', async () => {
      repo.findById
        .mockResolvedValueOnce(
          makeNote({ assignmentMode: 'INTERNAL_EMPLOYEE' }),
        )
        .mockResolvedValueOnce(
          makeNote({
            status: 'DISPATCHED',
            assignmentMode: 'INTERNAL_EMPLOYEE',
          }),
        );

      await service.dispatch(
        'tenant-1',
        'note-1',
        { carrier: 'Juan Pérez' },
        'user-1',
        MANAGE,
      );

      expect(repo.update).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        expect.objectContaining({ status: 'DISPATCHED' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'delivery.dispatched',
        expect.objectContaining({
          tenantId: 'tenant-1',
          deliveryNoteId: 'note-1',
        }),
      );
    });

    // El repartidor asignado puede despachar su propia entrega (empezar el
    // viaje) sin necesitar logistics:manage — mismo criterio que
    // DeliveryTrackingService.recordTrackingEvent().
    it('lets the assigned courier dispatch their own note with logistics:track', async () => {
      repo.findById
        .mockResolvedValueOnce(
          makeNote({
            assignmentMode: 'INTERNAL_EMPLOYEE',
            assignedEmployeeId: 'emp-1',
          }),
        )
        .mockResolvedValueOnce(
          makeNote({
            status: 'DISPATCHED',
            assignmentMode: 'INTERNAL_EMPLOYEE',
          }),
        );
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        tenantId: 'tenant-1',
      });

      await service.dispatch('tenant-1', 'note-1', {}, 'user-1', [
        'logistics:track',
      ]);

      expect(repo.update).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        expect.objectContaining({ status: 'DISPATCHED' }),
      );
    });

    it('rejects logistics:track when the linked employee belongs to another tenant', async () => {
      repo.findById.mockResolvedValue(
        makeNote({
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'emp-1',
        }),
      );
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        tenantId: 'other-tenant',
      });

      await expect(
        service.dispatch('tenant-1', 'note-1', {}, 'user-1', [
          'logistics:track',
        ]),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rejects logistics:track when the note is assigned to a different employee', async () => {
      repo.findById.mockResolvedValue(
        makeNote({
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'emp-1',
        }),
      );
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-2',
        tenantId: 'tenant-1',
      });

      await expect(
        service.dispatch('tenant-1', 'note-1', {}, 'user-1', [
          'logistics:track',
        ]),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('rejects a user with neither logistics:manage nor logistics:track', async () => {
      repo.findById.mockResolvedValue(
        makeNote({ assignmentMode: 'INTERNAL_EMPLOYEE' }),
      );

      await expect(
        service.dispatch('tenant-1', 'note-1', {}, 'user-1', []),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('markDelivered', () => {
    it('rejects a note that is not DISPATCHED', async () => {
      repo.findById.mockResolvedValue(makeNote({ status: 'PENDING' }));

      await expect(
        service.markDelivered('tenant-1', 'note-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    // El retiro se cierra registrando quién se llevó el pedido.
    it('refuses to mark a pickup as delivered without registering who took it', async () => {
      repo.findById.mockResolvedValue(
        makeNote({ status: 'DISPATCHED', method: 'PICKUP' }),
      );

      await expect(
        service.markDelivered('tenant-1', 'note-1', 'user-1'),
      ).rejects.toThrow(/registrá el retiro/);
      expect(repo.close).not.toHaveBeenCalled();
    });

    it('closes a pending delivery that never goes through dispatch', async () => {
      repo.findById.mockResolvedValue(makeNote({ method: 'PICKUP' }));

      await service.complete('tenant-1', 'note-1', 'user-1');

      expect(repo.close).toHaveBeenCalledWith('tenant-1', 'note-1', tx);
      expect(outbox.enqueue).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'delivery.note.delivered',
        expect.objectContaining({ saleOrderId: 'order-1' }),
      );
    });

    it('does not close a delivery twice', async () => {
      repo.findById.mockResolvedValue(makeNote({ status: 'DELIVERED' }));

      await expect(
        service.complete('tenant-1', 'note-1', 'user-1'),
      ).rejects.toThrow(/ya fue cerrada/);
    });

    // Dos cierres simultáneos: el segundo no descuenta stock otra vez.
    it('does not announce the delivery when another request closed it first', async () => {
      repo.findById.mockResolvedValue(makeNote({ status: 'DISPATCHED' }));
      repo.close.mockResolvedValue(0);

      await expect(
        service.markDelivered('tenant-1', 'note-1', 'user-1'),
      ).rejects.toThrow(/ya fue cerrada/);
      expect(outbox.enqueue).not.toHaveBeenCalled();
      expect(outbox.dispatch).not.toHaveBeenCalled();
    });

    it('closes a DISPATCHED note and sends the stock-out chain through the outbox', async () => {
      repo.findById
        .mockResolvedValueOnce(makeNote({ status: 'DISPATCHED' }))
        .mockResolvedValueOnce(makeNote({ status: 'DELIVERED' }));

      await service.markDelivered('tenant-1', 'note-1', 'user-1');

      expect(outbox.enqueue).toHaveBeenCalledWith(
        tx,
        'tenant-1',
        'delivery.note.delivered',
        {
          tenantId: 'tenant-1',
          saleOrderId: 'order-1',
          deliveryNoteId: 'note-1',
          userId: 'user-1',
        },
      );
      expect(outbox.dispatch).toHaveBeenCalledWith('evt-1');
      expect(eventEmitter.emit).not.toHaveBeenCalledWith(
        'delivery.note.delivered',
        expect.anything(),
      );
    });
  });

  describe('backfillPending', () => {
    it('only looks at tenants that use Logistics', async () => {
      await service.backfillPending();

      expect(prisma.saleOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant: {
              tenantModules: {
                some: { moduleName: 'logistics', active: true },
              },
            },
          }),
        }),
      );
    });

    it('creates the missing notes and keeps going when one fails', async () => {
      prisma.saleOrder.findMany.mockResolvedValue([
        { id: 'o1', tenantId: 'tenant-1' },
        { id: 'o2', tenantId: 'tenant-1' },
        { id: 'o3', tenantId: 'tenant-1' },
      ]);
      repo.ensurePendingForOrder
        .mockResolvedValueOnce({ id: 'n1', created: true })
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce({ id: 'n3', created: false });

      await expect(service.backfillPending('tenant-1')).resolves.toBe(1);
      expect(repo.ensurePendingForOrder).toHaveBeenCalledTimes(3);
      expect(prisma.saleOrder.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenantId: 'tenant-1' }),
        }),
      );
    });
  });

  describe('syncWithSales', () => {
    it('closes what Sales already delivered and opens the missing notes', async () => {
      repo.closeDeliveredOutsideLogistics.mockResolvedValue(2);
      prisma.saleOrder.findMany.mockResolvedValue([
        { id: 'o1', tenantId: 'tenant-1' },
      ]);

      await expect(service.syncWithSales('tenant-1')).resolves.toEqual({
        closed: 2,
        created: 1,
      });
      expect(repo.closeDeliveredOutsideLogistics).toHaveBeenCalledWith(
        'tenant-1',
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('delivery.note.created', {
        tenantId: 'tenant-1',
      });
    });
  });
});
