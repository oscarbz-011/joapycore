import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeliveryRoutesService } from './delivery-routes.service';

// Lejos en el futuro: las reglas de "día que ya pasó" no dependen del reloj.
const DAY = '2099-03-10';
const NEXT_DAY = '2099-03-11';
const utc = (day: string) => new Date(`${day}T00:00:00.000Z`);

const driver = { id: 'emp-1', firstName: 'Luis', lastName: 'Rojas' };

function makeStop(overrides = {}) {
  return {
    id: 'note-1',
    noteNumber: 'NE-1',
    status: 'PENDING',
    method: 'HOME_DELIVERY',
    routeId: null as string | null,
    routeOrder: null as number | null,
    scheduledDate: null as Date | null,
    scheduledShift: null as string | null,
    assignedEmployeeId: null as string | null,
    createdAt: new Date(),
    saleOrder: {
      id: 'order-1',
      customer: {
        id: 'cust-1',
        firstName: 'María',
        lastName: 'González',
        phone: '0981 111 222',
        address: 'Av. España 123',
        city: 'Asunción',
        homeStreet: null,
        homeNeighborhood: 'Villa Morra',
        homeReference: null,
        latitude: '-25.290000',
        longitude: '-57.580000',
      },
      items: [{ quantity: 2 }, { quantity: 1 }],
    },
    ...overrides,
  };
}

function makeRoute(overrides = {}) {
  return {
    id: 'route-1',
    routeDate: utc(DAY),
    shift: 'MORNING',
    name: null,
    vehicle: null,
    notes: null,
    driverEmployeeId: driver.id as string | null,
    driver: driver as typeof driver | null,
    deliveries: [
      makeStop({ id: 'a', routeId: 'route-1', assignedEmployeeId: driver.id }),
      makeStop({ id: 'b', routeId: 'route-1', assignedEmployeeId: driver.id }),
    ],
    ...overrides,
  };
}

describe('DeliveryRoutesService', () => {
  let service: DeliveryRoutesService;
  let routes: Record<string, jest.Mock>;
  let sources: { findActiveCourier: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  beforeEach(() => {
    routes = {
      findForDay: jest.fn().mockResolvedValue([makeRoute()]),
      findUnplanned: jest.fn().mockResolvedValue([makeStop()]),
      findById: jest.fn().mockResolvedValue(makeRoute()),
      findStop: jest.fn().mockResolvedValue(makeStop()),
      create: jest.fn().mockResolvedValue({ id: 'route-1' }),
      update: jest.fn().mockResolvedValue(1),
      placeStop: jest.fn().mockResolvedValue(true),
      reorder: jest.fn().mockResolvedValue(undefined),
      changePendingStop: jest.fn().mockResolvedValue(true),
      remove: jest.fn().mockResolvedValue(true),
    };
    sources = { findActiveCourier: jest.fn().mockResolvedValue(driver) };
    eventEmitter = { emit: jest.fn() };
    service = new DeliveryRoutesService(
      routes as never,
      sources as never,
      eventEmitter as never,
    );
  });

  describe('board', () => {
    it('shows the routes of the day and what still waits for one', async () => {
      const board = await service.board('tenant-1', DAY);

      expect(routes.findForDay).toHaveBeenCalledWith('tenant-1', utc(DAY));
      expect(routes.findUnplanned).toHaveBeenCalledWith('tenant-1');
      expect(board.routes[0]).toMatchObject({
        id: 'route-1',
        date: DAY,
        shift: 'MORNING',
        driver,
      });
      expect(board.unplanned[0]).toMatchObject({
        id: 'note-1',
        units: 3,
        customer: {
          name: 'María González',
          address: 'Av. España 123, Villa Morra, Asunción',
          latitude: -25.29,
          longitude: -57.58,
        },
      });
    });

    it('refuses a date that is not a day', async () => {
      await expect(service.board('tenant-1', 'mañana')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });

  describe('create', () => {
    it('creates the route for the day, the shift and the driver', async () => {
      await service.create(
        'tenant-1',
        { date: DAY, shift: 'AFTERNOON', driverEmployeeId: driver.id },
        'user-1',
      );

      expect(sources.findActiveCourier).toHaveBeenCalledWith(
        'tenant-1',
        driver.id,
      );
      expect(routes.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 'tenant-1',
          routeDate: utc(DAY),
          shift: 'AFTERNOON',
          driverEmployeeId: driver.id,
          createdById: 'user-1',
        }),
      );
    });

    it('does not plan a day that already passed', async () => {
      await expect(
        service.create('tenant-1', { date: '2020-01-01', shift: 'MORNING' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(routes.create).not.toHaveBeenCalled();
    });

    // Un empleado de otra empresa, o que no es repartidor, no existe.
    it('refuses a driver that is not a courier of this tenant', async () => {
      sources.findActiveCourier.mockResolvedValue(null);

      await expect(
        service.create('tenant-1', {
          date: DAY,
          shift: 'MORNING',
          driverEmployeeId: 'emp-other',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(routes.create).not.toHaveBeenCalled();
    });
  });

  describe('addDelivery', () => {
    it('schedules the delivery with the route and gives it the driver', async () => {
      await service.addDelivery('tenant-1', 'route-1', {
        deliveryNoteId: 'note-1',
      });

      expect(routes.placeStop).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        'note-1',
        {
          scheduledDate: utc(DAY),
          scheduledShift: 'MORNING',
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: driver.id,
          carrier: 'Luis Rojas',
        },
        ['a', 'b', 'note-1'],
      );
    });

    it('puts it where the planner asked', async () => {
      await service.addDelivery('tenant-1', 'route-1', {
        deliveryNoteId: 'note-1',
        position: 1,
      });

      expect(routes.placeStop.mock.calls[0][4]).toEqual(['a', 'note-1', 'b']);
    });

    it('does not reveal a route of another tenant', async () => {
      routes.findById.mockResolvedValue(null);

      await expect(
        service.addDelivery('tenant-2', 'route-1', {
          deliveryNoteId: 'note-1',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(routes.findById).toHaveBeenCalledWith('tenant-2', 'route-1');
      expect(routes.placeStop).not.toHaveBeenCalled();
    });

    it('does not take a delivery of another tenant', async () => {
      routes.findStop.mockResolvedValue(null);

      await expect(
        service.addDelivery('tenant-1', 'route-1', { deliveryNoteId: 'x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(routes.findStop).toHaveBeenCalledWith('tenant-1', 'x');
    });

    it('only takes home deliveries that have not left yet', async () => {
      routes.findStop.mockResolvedValue(makeStop({ method: 'PICKUP' }));
      await expect(
        service.addDelivery('tenant-1', 'route-1', {
          deliveryNoteId: 'note-1',
        }),
      ).rejects.toThrow(/retira el cliente/);

      routes.findStop.mockResolvedValue(makeStop({ status: 'DISPATCHED' }));
      await expect(
        service.addDelivery('tenant-1', 'route-1', {
          deliveryNoteId: 'note-1',
        }),
      ).rejects.toThrow(/todavía no salieron/);
      expect(routes.placeStop).not.toHaveBeenCalled();
    });

    it('does not add to a route of a day that passed', async () => {
      routes.findById.mockResolvedValue(
        makeRoute({ routeDate: utc('2020-01-01') }),
      );

      await expect(
        service.addDelivery('tenant-1', 'route-1', {
          deliveryNoteId: 'note-1',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    // La despacharon entre la lectura y la escritura.
    it('reports it when the delivery changed meanwhile', async () => {
      routes.placeStop.mockResolvedValue(false);

      await expect(
        service.addDelivery('tenant-1', 'route-1', {
          deliveryNoteId: 'note-1',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('drops the old driver when moving to a route without one', async () => {
      const target = makeRoute({
        id: 'route-2',
        driverEmployeeId: null,
        driver: null,
        deliveries: [],
      });
      routes.findById.mockImplementation((_tenant: string, id: string) =>
        Promise.resolve(id === 'route-2' ? target : makeRoute()),
      );
      routes.findStop.mockResolvedValue(
        makeStop({ routeId: 'route-1', assignedEmployeeId: driver.id }),
      );

      await service.addDelivery('tenant-1', 'route-2', {
        deliveryNoteId: 'note-1',
      });

      expect(routes.placeStop.mock.calls[0][3]).toMatchObject({
        assignedEmployeeId: null,
        assignmentMode: null,
      });
    });
  });

  describe('reorder', () => {
    it('saves the new order of the same stops', async () => {
      await service.reorder('tenant-1', 'route-1', {
        deliveryNoteIds: ['b', 'a'],
      });

      expect(routes.reorder).toHaveBeenCalledWith('tenant-1', 'route-1', [
        'b',
        'a',
      ]);
    });

    it('refuses an order that names other stops', async () => {
      await expect(
        service.reorder('tenant-1', 'route-1', { deliveryNoteIds: ['a', 'x'] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(routes.reorder).not.toHaveBeenCalled();
    });
  });

  describe('removeDelivery', () => {
    it('takes it out and removes the driver the route had given it', async () => {
      routes.findStop.mockResolvedValue(
        makeStop({ routeId: 'route-1', assignedEmployeeId: driver.id }),
      );

      await service.removeDelivery('tenant-1', 'note-1');

      expect(routes.changePendingStop).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        {
          routeId: null,
          routeOrder: null,
          assignmentMode: null,
          assignedEmployeeId: null,
          carrier: null,
        },
      );
    });

    it('keeps a driver that was assigned by hand', async () => {
      routes.findStop.mockResolvedValue(
        makeStop({ routeId: 'route-1', assignedEmployeeId: 'emp-9' }),
      );

      await service.removeDelivery('tenant-1', 'note-1');

      expect(routes.changePendingStop.mock.calls[0][2]).toEqual({
        routeId: null,
        routeOrder: null,
      });
    });

    it('refuses a delivery that is in no route', async () => {
      await expect(
        service.removeDelivery('tenant-1', 'note-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('schedule', () => {
    it('moves a delivery to the next day and out of its route', async () => {
      routes.findStop.mockResolvedValue(
        makeStop({
          routeId: 'route-1',
          assignedEmployeeId: driver.id,
          scheduledDate: utc(DAY),
          scheduledShift: 'MORNING',
        }),
      );

      const result = await service.schedule('tenant-1', 'note-1', {
        date: NEXT_DAY,
      });

      expect(routes.changePendingStop).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        {
          scheduledDate: utc(NEXT_DAY),
          scheduledShift: 'MORNING',
          routeId: null,
          routeOrder: null,
          assignmentMode: null,
          assignedEmployeeId: null,
          carrier: null,
        },
      );
      expect(result).toEqual({
        id: 'note-1',
        scheduledDate: NEXT_DAY,
        scheduledShift: 'MORNING',
      });
    });

    it('stays in its route when the day and shift are the same', async () => {
      routes.findStop.mockResolvedValue(makeStop({ routeId: 'route-1' }));

      await service.schedule('tenant-1', 'note-1', {
        date: DAY,
        shift: 'MORNING',
      });

      expect(routes.changePendingStop.mock.calls[0][2]).toEqual({
        scheduledDate: utc(DAY),
        scheduledShift: 'MORNING',
      });
    });

    it('can leave a delivery without a date', async () => {
      await service.schedule('tenant-1', 'note-1', { date: null });

      expect(routes.changePendingStop.mock.calls[0][2]).toEqual({
        scheduledDate: null,
        scheduledShift: null,
      });
    });

    it('does not schedule for a day that passed', async () => {
      await expect(
        service.schedule('tenant-1', 'note-1', { date: '2020-01-01' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(routes.changePendingStop).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('passes a new driver on to the stops that have not left', async () => {
      const other = { id: 'emp-2', firstName: 'Ana', lastName: 'Vera' };
      sources.findActiveCourier.mockResolvedValue(other);

      await service.update('tenant-1', 'route-1', {
        driverEmployeeId: 'emp-2',
      });

      expect(routes.update).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        { driverEmployeeId: 'emp-2' },
        expect.objectContaining({
          assignedEmployeeId: 'emp-2',
          carrier: 'Ana Vera',
        }),
      );
    });

    it('leaves the stops alone when only the vehicle changes', async () => {
      await service.update('tenant-1', 'route-1', { vehicle: ' Camión 2 ' });

      expect(routes.update).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        { vehicle: 'Camión 2' },
        undefined,
      );
    });
  });

  describe('remove', () => {
    it('deletes the route and frees its deliveries', async () => {
      await service.remove('tenant-1', 'route-1');

      expect(routes.remove).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        expect.objectContaining({ routeId: null, assignedEmployeeId: null }),
      );
    });

    it('keeps a route that already has deliveries on the way', async () => {
      routes.remove.mockResolvedValue(false);

      await expect(
        service.remove('tenant-1', 'route-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not delete a route of another tenant', async () => {
      routes.findById.mockResolvedValue(null);

      await expect(
        service.remove('tenant-2', 'route-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(routes.remove).not.toHaveBeenCalled();
    });
  });
});
