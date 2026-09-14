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
  let repo: { findById: jest.Mock; findAll: jest.Mock; update: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let prisma: { employee: { findUnique: jest.Mock } };

  beforeEach(() => {
    repo = { findById: jest.fn(), findAll: jest.fn(), update: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    prisma = { employee: { findUnique: jest.fn() } };
    service = new DeliveryNotesService(
      repo as any,
      eventEmitter as any,
      new LogisticsSourcesRepository(prisma as any),
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

    it('marks a DISPATCHED note as DELIVERED and emits the stock-out chain event', async () => {
      repo.findById
        .mockResolvedValueOnce(makeNote({ status: 'DISPATCHED' }))
        .mockResolvedValueOnce(makeNote({ status: 'DELIVERED' }));

      await service.markDelivered('tenant-1', 'note-1', 'user-1');

      expect(repo.update).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        expect.objectContaining({ status: 'DELIVERED' }),
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'delivery.note.delivered',
        expect.objectContaining({
          tenantId: 'tenant-1',
          saleOrderId: 'order-1',
          deliveryNoteId: 'note-1',
        }),
      );
    });
  });
});
