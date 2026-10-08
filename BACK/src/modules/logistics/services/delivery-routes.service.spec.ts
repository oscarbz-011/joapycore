import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { startOfBusinessDay } from '../../../common/utils/business-date.util';
import { DeliveryRoutesService } from './delivery-routes.service';

// Lejos en el futuro: las reglas de "día que ya pasó" no dependen del reloj.
const DAY = '2099-03-10';
const utc = (day: string) => new Date(`${day}T00:00:00.000Z`);
const today = () => startOfBusinessDay();

const driver = { id: 'emp-1', firstName: 'Luis', lastName: 'Rojas' };
const otherDriver = { id: 'emp-2', firstName: 'Ana', lastName: 'Vera' };

// Quién actúa.
const dispatcher = {
  userId: 'disp-1',
  permissions: ['logistics:read', 'logistics:assign', 'logistics:manage'],
};
const driverUser = { userId: 'user-driver', permissions: ['logistics:track'] };
const stranger = { userId: 'user-x', permissions: ['sales:read'] };

function makeStop(overrides = {}) {
  return {
    id: 'note-1',
    noteNumber: 'NE-1',
    status: 'PENDING',
    method: 'HOME_DELIVERY',
    routeId: null as string | null,
    routeOrder: null as number | null,
    assignedEmployeeId: null as string | null,
    deliveredAt: null,
    createdAt: new Date(),
    route: null as Record<string, unknown> | null,
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
        homeReference: 'Portón verde',
        latitude: '-25.290000',
        longitude: '-57.580000',
      },
      items: [
        { quantity: 2, product: { name: 'Heladera' } },
        { quantity: 1, product: { name: 'Microondas' } },
      ],
    },
    ...overrides,
  };
}

function makeRoute(overrides = {}) {
  return {
    id: 'route-1',
    code: 'RUT-26-000001',
    routeDate: utc(DAY),
    status: 'OPEN',
    vehicle: null as string | null,
    driverEmployeeId: driver.id as string | null,
    driver: driver as typeof driver | null,
    startedAt: null,
    finishedAt: null,
    createdAt: new Date(),
    deliveries: [
      makeStop({ id: 'a', routeId: 'route-1' }),
      makeStop({ id: 'b', routeId: 'route-1' }),
    ],
    events: [],
    ...overrides,
  };
}

const inRoute = (route: ReturnType<typeof makeRoute>, overrides = {}) =>
  makeStop({
    routeId: route.id,
    assignedEmployeeId: route.driverEmployeeId,
    route: {
      id: route.id,
      code: route.code,
      status: route.status,
      routeDate: route.routeDate,
      driverEmployeeId: route.driverEmployeeId,
    },
    ...overrides,
  });

describe('DeliveryRoutesService', () => {
  let service: DeliveryRoutesService;
  let routes: Record<string, jest.Mock>;
  let sources: { findActiveCourier: jest.Mock; findEmployeeByUser: jest.Mock };
  let trackingEvents: { create: jest.Mock };
  let eventEmitter: { emit: jest.Mock };

  const emitted = (name: string) =>
    eventEmitter.emit.mock.calls.filter(([event]) => event === name);

  beforeEach(() => {
    routes = {
      findPage: jest.fn().mockResolvedValue([[makeRoute()], 1]),
      findById: jest.fn().mockResolvedValue(makeRoute()),
      findDetail: jest.fn().mockResolvedValue(makeRoute()),
      findActiveForDriver: jest.fn().mockResolvedValue([makeRoute()]),
      findJoinable: jest.fn().mockResolvedValue(makeRoute()),
      findUnplanned: jest.fn().mockResolvedValue([makeStop()]),
      findStop: jest.fn().mockResolvedValue(makeStop()),
      create: jest.fn().mockResolvedValue(makeRoute({ deliveries: [] })),
      placeStop: jest.fn().mockResolvedValue(true),
      reorder: jest.fn().mockResolvedValue(undefined),
      releaseStop: jest.fn().mockResolvedValue(true),
      update: jest.fn().mockResolvedValue(true),
      start: jest.fn().mockResolvedValue([{ id: 'a', saleOrderId: 'order-a' }]),
      cancel: jest.fn().mockResolvedValue(true),
      completeIfDone: jest.fn().mockResolvedValue(false),
      addEvents: jest.fn().mockResolvedValue(undefined),
    };
    sources = {
      findActiveCourier: jest.fn().mockResolvedValue(otherDriver),
      findEmployeeByUser: jest.fn().mockResolvedValue({ id: driver.id }),
    };
    trackingEvents = { create: jest.fn().mockResolvedValue({}) };
    eventEmitter = { emit: jest.fn() };
    service = new DeliveryRoutesService(
      routes as never,
      sources as never,
      trackingEvents as never,
      eventEmitter as never,
    );
  });

  describe('list', () => {
    it('pages the routes with how many stops are delivered', async () => {
      routes.findPage.mockResolvedValue([
        [
          makeRoute({
            deliveries: [{ status: 'DELIVERED' }, { status: 'DISPATCHED' }],
          }),
        ],
        41,
      ]);

      const page = await service.list('tenant-1', {
        status: 'IN_PROGRESS',
        from: DAY,
        page: 2,
        limit: 20,
      });

      expect(routes.findPage).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ status: 'IN_PROGRESS', from: utc(DAY) }),
        { skip: 20, take: 20 },
      );
      expect(page).toMatchObject({ total: 41, page: 2, totalPages: 3 });
      expect(page.items[0]).toMatchObject({
        code: 'RUT-26-000001',
        date: DAY,
        stops: 2,
        delivered: 1,
      });
    });

    it('refuses a date that is not a day', async () => {
      await expect(
        service.list('tenant-1', { from: '2026-02-30' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('shows each stop with where to go and what to carry', async () => {
      const route = await service.findOne('tenant-1', 'route-1');

      expect(route.stops[0]).toMatchObject({
        units: 3,
        items: [
          { name: 'Heladera', quantity: 2 },
          { name: 'Microondas', quantity: 1 },
        ],
        customer: {
          name: 'María González',
          address: 'Av. España 123, Villa Morra, Asunción',
          reference: 'Portón verde',
          latitude: -25.29,
          longitude: -57.58,
        },
      });
    });

    it('does not reveal a route of another tenant', async () => {
      routes.findDetail.mockResolvedValue(null);

      await expect(
        service.findOne('tenant-2', 'route-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(routes.findDetail).toHaveBeenCalledWith('tenant-2', 'route-1');
    });
  });

  describe('findMine', () => {
    it('lists the routes of the employee behind the user', async () => {
      await service.findMine('tenant-1', 'user-driver');

      expect(routes.findActiveForDriver).toHaveBeenCalledWith(
        'tenant-1',
        driver.id,
      );
    });

    it('is empty for a user who is not an employee', async () => {
      sources.findEmployeeByUser.mockResolvedValue(null);

      await expect(service.findMine('tenant-1', 'user-x')).resolves.toEqual([]);
    });
  });

  describe('assignToDriver', () => {
    it("adds the delivery to the driver's route of that day", async () => {
      await service.assignToDriver('tenant-1', 'note-1', driver, {
        date: DAY,
        userId: 'disp-1',
      });

      expect(routes.findJoinable).toHaveBeenCalledWith(
        'tenant-1',
        driver.id,
        utc(DAY),
      );
      expect(routes.create).not.toHaveBeenCalled();
      expect(routes.placeStop).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        'note-1',
        {
          assignmentMode: 'INTERNAL_EMPLOYEE',
          assignedEmployeeId: driver.id,
          carrier: 'Luis Rojas',
        },
        ['a', 'b', 'note-1'],
        [
          expect.objectContaining({
            routeId: 'route-1',
            type: 'STOP_ADDED',
            deliveryNoteId: 'note-1',
            detail: 'María González',
            userId: 'disp-1',
          }),
        ],
      );
    });

    it('creates the route when the driver has none that day', async () => {
      routes.findJoinable.mockResolvedValue(null);

      const route = await service.assignToDriver('tenant-1', 'note-1', driver, {
        date: DAY,
        userId: 'disp-1',
      });

      expect(routes.create).toHaveBeenCalledWith({
        tenantId: 'tenant-1',
        routeDate: utc(DAY),
        driverEmployeeId: driver.id,
        createdById: 'disp-1',
      });
      expect(route).toEqual({ id: 'route-1', code: 'RUT-26-000001' });
    });

    it('uses today when no day is given', async () => {
      await service.assignToDriver('tenant-1', 'note-1', driver, {});

      expect(routes.findJoinable).toHaveBeenCalledWith(
        'tenant-1',
        driver.id,
        today(),
      );
    });

    it('does not plan a day that already passed', async () => {
      await expect(
        service.assignToDriver('tenant-1', 'note-1', driver, {
          date: '2020-01-01',
        }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
      expect(routes.placeStop).not.toHaveBeenCalled();
    });

    it('leaves it alone when it is already in that route', async () => {
      routes.findStop.mockResolvedValue(inRoute(makeRoute()));

      await service.assignToDriver('tenant-1', 'note-1', driver, { date: DAY });

      expect(routes.placeStop).not.toHaveBeenCalled();
    });

    // Reasignar a otro repartidor la pasa de ruta y lo deja escrito en las dos.
    it('moves it from the route of the previous driver', async () => {
      routes.findStop.mockResolvedValue(inRoute(makeRoute()));
      routes.findJoinable.mockResolvedValue(
        makeRoute({
          id: 'route-2',
          code: 'RUT-26-000002',
          driverEmployeeId: otherDriver.id,
          driver: otherDriver,
          deliveries: [],
        }),
      );

      await service.assignToDriver('tenant-1', 'note-1', otherDriver, {
        date: DAY,
      });

      const events = routes.placeStop.mock.calls[0][5];
      expect(events).toEqual([
        expect.objectContaining({
          routeId: 'route-1',
          type: 'STOP_REMOVED',
          detail: 'María González (pasó a la ruta RUT-26-000002)',
        }),
        expect.objectContaining({ routeId: 'route-2', type: 'STOP_ADDED' }),
      ]);
    });

    // La ruta ya está en la calle: la entrega sale con ella en el acto.
    it('dispatches it right away when the route is already on the road', async () => {
      routes.findJoinable.mockResolvedValue(
        makeRoute({
          status: 'IN_PROGRESS',
          routeDate: today(),
          vehicle: 'Camión 1',
        }),
      );

      await service.assignToDriver('tenant-1', 'note-1', driver, {});

      expect(routes.placeStop.mock.calls[0][3]).toMatchObject({
        status: 'DISPATCHED',
        vehicle: 'Camión 1',
      });
      expect(emitted('delivery.dispatched')).toHaveLength(1);
    });

    it('only takes home deliveries that have not left yet', async () => {
      routes.findStop.mockResolvedValue(makeStop({ method: 'PICKUP' }));
      await expect(
        service.assignToDriver('tenant-1', 'note-1', driver, {}),
      ).rejects.toThrow(/retira el cliente/);

      routes.findStop.mockResolvedValue(makeStop({ status: 'DELIVERED' }));
      await expect(
        service.assignToDriver('tenant-1', 'note-1', driver, {}),
      ).rejects.toThrow(/todavía no salieron/);
    });

    it('does not take a delivery of another tenant', async () => {
      routes.findStop.mockResolvedValue(null);

      await expect(
        service.assignToDriver('tenant-2', 'note-1', driver, {}),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(routes.findStop).toHaveBeenCalledWith('tenant-2', 'note-1');
    });

    // La despacharon entre la lectura y la escritura.
    it('reports it when the delivery changed meanwhile', async () => {
      routes.placeStop.mockResolvedValue(false);

      await expect(
        service.assignToDriver('tenant-1', 'note-1', driver, { date: DAY }),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('addDelivery', () => {
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
      expect(routes.placeStop).not.toHaveBeenCalled();
    });

    it('does not add to a route that is over', async () => {
      routes.findById.mockResolvedValue(makeRoute({ status: 'COMPLETED' }));

      await expect(
        service.addDelivery('tenant-1', 'route-1', {
          deliveryNoteId: 'note-1',
        }),
      ).rejects.toThrow(/ya terminó/);
    });
  });

  describe('reorder', () => {
    it('saves the new order and writes it down', async () => {
      await service.reorder(
        'tenant-1',
        'route-1',
        { deliveryNoteIds: ['b', 'a'] },
        'disp-1',
      );

      expect(routes.reorder).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        ['b', 'a'],
        [{ routeId: 'route-1', type: 'REORDERED', userId: 'disp-1' }],
      );
    });

    it('refuses an order that names other stops', async () => {
      await expect(
        service.reorder('tenant-1', 'route-1', { deliveryNoteIds: ['a', 'x'] }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(routes.reorder).not.toHaveBeenCalled();
    });
  });

  describe('removeDelivery', () => {
    it('takes it out of the route and leaves it without a driver', async () => {
      routes.findStop.mockResolvedValue(inRoute(makeRoute()));

      await service.removeDelivery('tenant-1', 'note-1', 'disp-1');

      expect(routes.releaseStop).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        { status: 'PENDING', routeId: 'route-1' },
        {
          routeId: null,
          routeOrder: null,
          assignmentMode: null,
          assignedEmployeeId: null,
          carrier: null,
        },
        [
          expect.objectContaining({
            type: 'STOP_REMOVED',
            detail: 'María González',
            userId: 'disp-1',
          }),
        ],
      );
    });

    it('does not pull out a delivery that already left', async () => {
      routes.findStop.mockResolvedValue(
        inRoute(makeRoute({ status: 'IN_PROGRESS' }), { status: 'DISPATCHED' }),
      );

      await expect(
        service.removeDelivery('tenant-1', 'note-1'),
      ).rejects.toThrow(/ya salió/);
      expect(routes.releaseStop).not.toHaveBeenCalled();
    });

    it('refuses a delivery that is in no route', async () => {
      await expect(
        service.removeDelivery('tenant-1', 'note-1'),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('start', () => {
    beforeEach(() => {
      routes.findById.mockResolvedValue(makeRoute({ routeDate: today() }));
    });

    it('lets the driver of the route start it', async () => {
      await service.start(
        'tenant-1',
        'route-1',
        { vehicle: ' Camión 2 ' },
        driverUser,
      );

      expect(routes.start).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        { status: 'DISPATCHED', vehicle: 'Camión 2' },
        { vehicle: 'Camión 2' },
        [{ routeId: 'route-1', type: 'STARTED', userId: 'user-driver' }],
      );
      // Cada entrega que salió avisa, como cuando se despacha suelta.
      expect(emitted('delivery.dispatched')).toEqual([
        [
          'delivery.dispatched',
          { tenantId: 'tenant-1', saleOrderId: 'order-a', deliveryNoteId: 'a' },
        ],
      ]);
    });

    it('lets logistics start it too', async () => {
      await expect(
        service.start('tenant-1', 'route-1', {}, dispatcher),
      ).resolves.toBeDefined();
    });

    it('does not let another driver start it', async () => {
      sources.findEmployeeByUser.mockResolvedValue({ id: 'emp-9' });

      await expect(
        service.start('tenant-1', 'route-1', {}, driverUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(routes.start).not.toHaveBeenCalled();
    });

    it('does not let someone without logistics access start it', async () => {
      await expect(
        service.start('tenant-1', 'route-1', {}, stranger),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('does not start an empty route', async () => {
      routes.findById.mockResolvedValue(
        makeRoute({ routeDate: today(), deliveries: [] }),
      );

      await expect(
        service.start('tenant-1', 'route-1', {}, dispatcher),
      ).rejects.toThrow(/no tiene entregas/);
    });

    it('does not start a route planned for a later day', async () => {
      routes.findById.mockResolvedValue(makeRoute());

      await expect(
        service.start('tenant-1', 'route-1', {}, dispatcher),
      ).rejects.toThrow(/otro día/);
    });

    it('does not start it twice', async () => {
      routes.findById.mockResolvedValue(
        makeRoute({ routeDate: today(), status: 'IN_PROGRESS' }),
      );
      await expect(
        service.start('tenant-1', 'route-1', {}, dispatcher),
      ).rejects.toThrow(/ya está en curso/);

      // Dos personas la inician a la vez: la segunda escritura no encuentra la ruta abierta.
      routes.findById.mockResolvedValue(makeRoute({ routeDate: today() }));
      routes.start.mockResolvedValue(null);
      await expect(
        service.start('tenant-1', 'route-1', {}, dispatcher),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('failDelivery', () => {
    const onTheRoad = () =>
      inRoute(makeRoute({ status: 'IN_PROGRESS' }), { status: 'DISPATCHED' });

    beforeEach(() => {
      routes.findStop.mockResolvedValue(onTheRoad());
    });

    it('sends the delivery back to pending, out of the route, with the reason', async () => {
      await service.failDelivery(
        'tenant-1',
        'note-1',
        {
          reason: 'ABSENT',
          note: 'Vuelve el lunes',
          latitude: -25.3,
          longitude: -57.6,
        },
        driverUser,
      );

      expect(routes.releaseStop).toHaveBeenCalledWith(
        'tenant-1',
        'note-1',
        { status: 'DISPATCHED', routeId: 'route-1' },
        expect.objectContaining({
          status: 'PENDING',
          routeId: null,
          assignedEmployeeId: null,
        }),
        [
          expect.objectContaining({
            routeId: 'route-1',
            type: 'STOP_FAILED',
            detail: 'María González',
            reason: 'No había nadie para recibir. Vuelve el lunes',
            latitude: -25.3,
            longitude: -57.6,
            userId: 'user-driver',
          }),
        ],
      );
      // El intento queda también en el recorrido de la entrega.
      expect(trackingEvents.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          deliveryNoteId: 'note-1',
          notes: expect.stringContaining('RUT-26-000001'),
          recordedById: 'user-driver',
        }),
      );
      // Si era la última parada, la ruta se cierra.
      expect(routes.completeIfDone).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        [{ routeId: 'route-1', type: 'COMPLETED' }],
      );
    });

    it('is not for another driver', async () => {
      sources.findEmployeeByUser.mockResolvedValue({ id: 'emp-9' });

      await expect(
        service.failDelivery(
          'tenant-1',
          'note-1',
          { reason: 'ABSENT' },
          driverUser,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(routes.releaseStop).not.toHaveBeenCalled();
    });

    it('needs the route to be on the road', async () => {
      routes.findStop.mockResolvedValue(inRoute(makeRoute()));

      await expect(
        service.failDelivery(
          'tenant-1',
          'note-1',
          { reason: 'ABSENT' },
          dispatcher,
        ),
      ).rejects.toThrow(/ruta en curso/);
    });

    it('does not touch a delivery of another tenant', async () => {
      routes.findStop.mockResolvedValue(null);

      await expect(
        service.failDelivery(
          'tenant-2',
          'note-1',
          { reason: 'ABSENT' },
          dispatcher,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    // Otro la marcó entregada en el mismo momento.
    it('reports it when the delivery changed meanwhile', async () => {
      routes.releaseStop.mockResolvedValue(false);

      await expect(
        service.failDelivery(
          'tenant-1',
          'note-1',
          { reason: 'ABSENT' },
          dispatcher,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(trackingEvents.create).not.toHaveBeenCalled();
    });
  });

  describe('stopDelivered', () => {
    it('writes it in the route and closes the route when nothing is left', async () => {
      routes.findStop.mockResolvedValue(
        inRoute(makeRoute({ status: 'IN_PROGRESS' }), { status: 'DELIVERED' }),
      );

      await service.stopDelivered('tenant-1', 'note-1', 'user-driver');

      expect(routes.addEvents).toHaveBeenCalledWith('tenant-1', [
        expect.objectContaining({
          routeId: 'route-1',
          type: 'STOP_DELIVERED',
          detail: 'María González',
          userId: 'user-driver',
        }),
      ]);
      expect(routes.completeIfDone).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        expect.any(Array),
      );
    });

    it('ignores a delivery that travels without a route', async () => {
      await service.stopDelivered('tenant-1', 'note-1');

      expect(routes.addEvents).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('passes a new driver on to the stops and records who it was', async () => {
      await service.update(
        'tenant-1',
        'route-1',
        { driverEmployeeId: otherDriver.id },
        'disp-1',
      );

      expect(sources.findActiveCourier).toHaveBeenCalledWith(
        'tenant-1',
        otherDriver.id,
      );
      expect(routes.update).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        ['OPEN'],
        { driverEmployeeId: otherDriver.id },
        expect.objectContaining({
          assignedEmployeeId: otherDriver.id,
          carrier: 'Ana Vera',
        }),
        [
          expect.objectContaining({
            type: 'DRIVER_CHANGED',
            detail: 'De Luis Rojas a Ana Vera',
          }),
        ],
      );
    });

    // Un empleado de otra empresa, o que no es repartidor, no existe.
    it('refuses a driver that is not a courier of this tenant', async () => {
      sources.findActiveCourier.mockResolvedValue(null);

      await expect(
        service.update('tenant-1', 'route-1', { driverEmployeeId: 'emp-x' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(routes.update).not.toHaveBeenCalled();
    });

    it('does not change the driver of a route that already left', async () => {
      routes.findById.mockResolvedValue(makeRoute({ status: 'IN_PROGRESS' }));

      await expect(
        service.update('tenant-1', 'route-1', {
          driverEmployeeId: otherDriver.id,
        }),
      ).rejects.toThrow(/antes de que la ruta salga/);
    });

    it('still lets the vehicle be corrected on the road', async () => {
      routes.findById.mockResolvedValue(makeRoute({ status: 'IN_PROGRESS' }));

      await service.update('tenant-1', 'route-1', { vehicle: ' Camión 2 ' });

      expect(routes.update).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        ['OPEN', 'IN_PROGRESS'],
        { vehicle: 'Camión 2' },
        undefined,
        [],
      );
    });

    it('does not move the route to a day that passed', async () => {
      await expect(
        service.update('tenant-1', 'route-1', { date: '2020-01-01' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('cancel', () => {
    it('cancels the route and frees its deliveries', async () => {
      await service.cancel('tenant-1', 'route-1', 'disp-1');

      expect(routes.cancel).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        expect.objectContaining({ routeId: null, assignedEmployeeId: null }),
        [{ routeId: 'route-1', type: 'CANCELLED', userId: 'disp-1' }],
      );
    });

    it('keeps a route that already left', async () => {
      routes.cancel.mockResolvedValue(false);

      await expect(
        service.cancel('tenant-1', 'route-1'),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('does not cancel a route of another tenant', async () => {
      routes.findById.mockResolvedValue(null);

      await expect(
        service.cancel('tenant-2', 'route-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(routes.cancel).not.toHaveBeenCalled();
    });
  });
});
