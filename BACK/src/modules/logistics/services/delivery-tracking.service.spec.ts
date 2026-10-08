import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeliveryTrackingService } from './delivery-tracking.service';
import { LogisticsSourcesRepository } from '../repositories/logistics-sources.repository';

function makeNote(overrides = {}) {
  return {
    id: 'note-1',
    tenantId: 'tenant-1',
    status: 'PENDING' as const,
    method: 'HOME_DELIVERY' as string,
    assignmentMode: null as string | null,
    assignedEmployeeId: null as string | null,
    carrier: null as string | null,
    route: null as { id: string; code: string } | null,
    saleOrder: { id: 'order-1', customerId: 'cust-1' },
    ...overrides,
  };
}

describe('DeliveryTrackingService', () => {
  let service: DeliveryTrackingService;
  let prisma: {
    employee: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
    };
    customer: { updateMany: jest.Mock };
  };
  let deliveryNotesRepository: {
    findById: jest.Mock;
    findMine: jest.Mock;
    assign: jest.Mock;
  };
  let trackingEventsRepository: {
    create: jest.Mock;
    findByDeliveryNote: jest.Mock;
  };
  let deliveryNotesService: { markDelivered: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let deliveryRoutesService: {
    assignToDriver: jest.Mock;
    removeDelivery: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      employee: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      customer: { updateMany: jest.fn() },
    };
    deliveryNotesRepository = {
      findById: jest.fn(),
      findMine: jest.fn(),
      assign: jest.fn(),
    };
    trackingEventsRepository = {
      create: jest.fn(),
      findByDeliveryNote: jest.fn(),
    };
    deliveryNotesService = { markDelivered: jest.fn() };
    eventEmitter = { emit: jest.fn() };
    deliveryRoutesService = {
      assignToDriver: jest
        .fn()
        .mockResolvedValue({ id: 'route-1', code: 'RUT-26-000001' }),
      removeDelivery: jest.fn(),
    };

    service = new DeliveryTrackingService(
      new LogisticsSourcesRepository(prisma as any),
      deliveryNotesRepository as any,
      trackingEventsRepository as any,
      deliveryNotesService as any,
      eventEmitter as any,
      deliveryRoutesService as any,
    );
  });

  describe('assign', () => {
    const courier = { id: 'emp-1', firstName: 'Juan', lastName: 'Pérez' };

    // Asignar a un repartidor es ponerla en su ruta de ese día.
    it('puts a pending delivery in the route of the driver', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(makeNote());
      prisma.employee.findFirst.mockResolvedValue(courier);

      await service.assign(
        'tenant-1',
        'note-1',
        {
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'emp-1',
          routeDate: '2099-03-10',
        } as any,
        'user-1',
      );

      expect(deliveryRoutesService.assignToDriver).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        courier,
        { date: '2099-03-10', userId: 'user-1' },
      );
    });

    it('takes it out of its route when it goes to an outside courier', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({ route: { id: 'route-1', code: 'RUT-26-000001' } }),
      );

      await service.assign('tenant-1', 'note-1', {
        assignmentMode: 'EXTERNAL_COMPANY',
        carrier: 'Courier SA',
      } as any);

      expect(deliveryRoutesService.removeDelivery).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        undefined,
      );
      expect(deliveryRoutesService.assignToDriver).not.toHaveBeenCalled();
    });

    it('does not reassign a delivery that already left with its route', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({
          status: 'DISPATCHED',
          route: { id: 'route-1', code: 'RUT-26-000001' },
        }),
      );
      prisma.employee.findFirst.mockResolvedValue(courier);

      await expect(
        service.assign('tenant-1', 'note-1', {
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'emp-1',
        } as any),
      ).rejects.toThrow(/RUT-26-000001/);
      expect(deliveryNotesRepository.assign).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the note does not exist', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(null);

      await expect(
        service.assign('tenant-1', 'ghost', {
          assignmentMode: 'INTERNAL_EMPLOYEE',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects assigning a DELIVERED note', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({ status: 'DELIVERED' }),
      );

      await expect(
        service.assign('tenant-1', 'note-1', {
          assignmentMode: 'INTERNAL_EMPLOYEE',
        } as any),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('resolves the employee name into carrier for INTERNAL_EMPLOYEE', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(makeNote());
      prisma.employee.findFirst.mockResolvedValue({
        id: 'emp-1',
        firstName: 'Juan',
        lastName: 'Pérez',
      });

      await service.assign('tenant-1', 'note-1', {
        assignmentMode: 'INTERNAL_EMPLOYEE',
        assignedEmployeeId: 'emp-1',
      } as any);

      expect(deliveryNotesRepository.assign).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        expect.objectContaining({
          assignedEmployeeId: 'emp-1',
          carrier: 'Juan Pérez',
        }),
      );
    });

    it('uses the given carrier name and clears assignedEmployeeId for EXTERNAL_COMPANY', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(makeNote());

      await service.assign('tenant-1', 'note-1', {
        assignmentMode: 'EXTERNAL_COMPANY',
        carrier: 'Correo Rápido SA',
      } as any);

      expect(deliveryNotesRepository.assign).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        expect.objectContaining({
          assignmentMode: 'EXTERNAL_COMPANY',
          assignedEmployeeId: null,
          carrier: 'Correo Rápido SA',
        }),
      );
    });

    // Sin repartidor: un retiro en sucursal o una entrega que pidió llevar
    // el vendedor no se asignan desde acá.
    it.each(['PICKUP', 'SELLER'])(
      'refuses to assign a courier to a %s delivery',
      async (method) => {
        deliveryNotesRepository.findById.mockResolvedValue(
          makeNote({ method }),
        );

        await expect(
          service.assign('tenant-1', 'note-1', {
            assignmentMode: 'INTERNAL_EMPLOYEE',
            assignedEmployeeId: 'emp-1',
          } as any),
        ).rejects.toThrow(/envío a domicilio/);
        expect(deliveryNotesRepository.assign).not.toHaveBeenCalled();
      },
    );

    it('throws NotFoundException when the employee does not belong to the tenant', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(makeNote());
      prisma.employee.findFirst.mockResolvedValue(null);

      await expect(
        service.assign('tenant-1', 'note-1', {
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'ghost',
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('findMine', () => {
    it('returns an empty list when the user has no linked employee', async () => {
      prisma.employee.findUnique.mockResolvedValue(null);

      const result = await service.findMine('tenant-1', 'user-1');

      expect(result).toEqual([]);
      expect(deliveryNotesRepository.findMine).not.toHaveBeenCalled();
    });

    it('returns an empty list when the linked employee belongs to another tenant', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        tenantId: 'other-tenant',
      });

      const result = await service.findMine('tenant-1', 'user-1');

      expect(result).toEqual([]);
    });

    it('lists notes assigned to the caller employee', async () => {
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        tenantId: 'tenant-1',
      });
      deliveryNotesRepository.findMine.mockResolvedValue([makeNote()]);

      const result = await service.findMine('tenant-1', 'user-1');

      expect(deliveryNotesRepository.findMine).toHaveBeenCalledWith(
        'tenant-1',
        'emp-1',
        undefined,
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('recordTrackingEvent', () => {
    it('throws ForbiddenException when the caller has neither logistics:manage nor logistics:track', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({ assignmentMode: 'INTERNAL_EMPLOYEE' }),
      );

      await expect(
        service.recordTrackingEvent('tenant-1', 'note-1', {}, 'user-1', []),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects tracking on a note assigned to an external courier company', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({ assignmentMode: 'EXTERNAL_COMPANY' }),
      );

      await expect(
        service.recordTrackingEvent('tenant-1', 'note-1', {}, 'user-1', [
          'logistics:manage',
        ]),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('rejects a logistics:track caller who is not the assigned employee', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
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
        service.recordTrackingEvent('tenant-1', 'note-1', {}, 'user-1', [
          'logistics:track',
        ]),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows the assigned employee to record a checkpoint', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'emp-1',
        }),
      );
      prisma.employee.findUnique.mockResolvedValue({
        id: 'emp-1',
        tenantId: 'tenant-1',
      });
      trackingEventsRepository.create.mockResolvedValue({ id: 'evt-1' });

      await service.recordTrackingEvent(
        'tenant-1',
        'note-1',
        { checkpoint: 'LEFT_WAREHOUSE' } as any,
        'user-1',
        ['logistics:track'],
      );

      expect(trackingEventsRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          deliveryNoteId: 'note-1',
          checkpoint: 'LEFT_WAREHOUSE',
          recordedById: 'user-1',
        }),
      );
    });

    it('allows a logistics:manage caller regardless of assignment', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'emp-1',
        }),
      );
      trackingEventsRepository.create.mockResolvedValue({ id: 'evt-1' });

      await service.recordTrackingEvent('tenant-1', 'note-1', {}, 'user-2', [
        'logistics:manage',
      ]);

      expect(prisma.employee.findUnique).not.toHaveBeenCalled();
      expect(trackingEventsRepository.create).toHaveBeenCalled();
    });

    it('syncs the customer location when locationConfirmed=false with new coordinates', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'emp-1',
        }),
      );
      trackingEventsRepository.create.mockResolvedValue({ id: 'evt-1' });

      await service.recordTrackingEvent(
        'tenant-1',
        'note-1',
        { locationConfirmed: false, latitude: -25.3, longitude: -57.6 },
        'user-1',
        ['logistics:manage'],
      );

      expect(prisma.customer.updateMany).toHaveBeenCalledWith({
        where: { id: 'cust-1', tenantId: 'tenant-1' },
        data: { latitude: -25.3, longitude: -57.6 },
      });
    });

    it('does not touch the customer when locationConfirmed=true', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'emp-1',
        }),
      );
      trackingEventsRepository.create.mockResolvedValue({ id: 'evt-1' });

      await service.recordTrackingEvent(
        'tenant-1',
        'note-1',
        { locationConfirmed: true, latitude: -25.3, longitude: -57.6 },
        'user-1',
        ['logistics:manage'],
      );

      expect(prisma.customer.updateMany).not.toHaveBeenCalled();
    });

    it('delegates to DeliveryNotesService.markDelivered when checkpoint=DELIVERED', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'emp-1',
        }),
      );
      trackingEventsRepository.create.mockResolvedValue({ id: 'evt-1' });

      await service.recordTrackingEvent(
        'tenant-1',
        'note-1',
        { checkpoint: 'DELIVERED' } as any,
        'user-1',
        ['logistics:manage'],
      );

      expect(deliveryNotesService.markDelivered).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        'user-1',
      );
    });

    it('does not call markDelivered for a non-DELIVERED checkpoint', async () => {
      deliveryNotesRepository.findById.mockResolvedValue(
        makeNote({
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: 'emp-1',
        }),
      );
      trackingEventsRepository.create.mockResolvedValue({ id: 'evt-1' });

      await service.recordTrackingEvent(
        'tenant-1',
        'note-1',
        { checkpoint: 'IN_TRANSIT' } as any,
        'user-1',
        ['logistics:manage'],
      );

      expect(deliveryNotesService.markDelivered).not.toHaveBeenCalled();
    });
  });

  describe('listTrackingEvents', () => {
    it('delegates to the repository', async () => {
      trackingEventsRepository.findByDeliveryNote.mockResolvedValue([
        { id: 'evt-1' },
      ]);

      const result = await service.listTrackingEvents('tenant-1', 'note-1');

      expect(trackingEventsRepository.findByDeliveryNote).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
      );
      expect(result).toEqual([{ id: 'evt-1' }]);
    });
  });
});
