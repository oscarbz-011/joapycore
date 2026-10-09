import {
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { DeliveryRouteCustomerStopsService } from './delivery-route-customer-stops.service';

const driverUser = { userId: 'user-driver', permissions: ['logistics:track'] };

// Dos pedidos del mismo cliente en la ruta; el primero ya llegó.
const notes = () => [
  { id: 'note-1', trackingEvents: [{ checkpoint: 'ARRIVED' }] },
  { id: 'note-2', trackingEvents: [] },
];

describe('DeliveryRouteCustomerStopsService', () => {
  let service: DeliveryRouteCustomerStopsService;
  let routes: { findById: jest.Mock; findCustomerStopsOnTheWay: jest.Mock };
  let tracking: { recordTrackingEvent: jest.Mock };
  let routesService: { failDelivery: jest.Mock };

  beforeEach(() => {
    routes = {
      findById: jest.fn().mockResolvedValue({ id: 'route-1' }),
      findCustomerStopsOnTheWay: jest.fn().mockResolvedValue(notes()),
    };
    tracking = { recordTrackingEvent: jest.fn().mockResolvedValue({}) };
    routesService = { failDelivery: jest.fn().mockResolvedValue({}) };
    service = new DeliveryRouteCustomerStopsService(
      routes as never,
      tracking as never,
      routesService as never,
    );
  });

  describe('deliver', () => {
    it('delivers every order of the customer with one confirmation', async () => {
      const result = await service.deliver(
        'tenant-1',
        'route-1',
        'cust-1',
        { latitude: -25.3, longitude: -57.6, locationConfirmed: true },
        driverUser,
      );

      expect(routes.findCustomerStopsOnTheWay).toHaveBeenCalledWith(
        'tenant-1',
        'route-1',
        'cust-1',
      );
      expect(tracking.recordTrackingEvent.mock.calls).toEqual(
        ['note-1', 'note-2'].map((id) => [
          'tenant-1',
          id,
          {
            checkpoint: 'DELIVERED',
            latitude: -25.3,
            longitude: -57.6,
            locationConfirmed: true,
          },
          'user-driver',
          ['logistics:track'],
        ]),
      );
      expect(result).toEqual({ delivered: 2 });
    });

    // Cada pedido pasa por los permisos de siempre: otro repartidor no puede.
    it('stops when the driver is not allowed on an order', async () => {
      tracking.recordTrackingEvent.mockRejectedValue(
        new ForbiddenException('Esta entrega no está asignada a vos'),
      );

      await expect(
        service.deliver('tenant-1', 'route-1', 'cust-1', {}, driverUser),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(tracking.recordTrackingEvent).toHaveBeenCalledTimes(1);
    });

    it('does not reveal a route of another tenant', async () => {
      routes.findById.mockResolvedValue(null);

      await expect(
        service.deliver('tenant-2', 'route-1', 'cust-1', {}, driverUser),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(routes.findById).toHaveBeenCalledWith('tenant-2', 'route-1');
      expect(tracking.recordTrackingEvent).not.toHaveBeenCalled();
    });

    it('refuses a customer with nothing on the way in the route', async () => {
      routes.findCustomerStopsOnTheWay.mockResolvedValue([]);

      await expect(
        service.deliver('tenant-1', 'route-1', 'cust-9', {}, driverUser),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });

  describe('markCheckpoint', () => {
    it('marks only the orders that do not have the checkpoint yet', async () => {
      const result = await service.markCheckpoint(
        'tenant-1',
        'route-1',
        'cust-1',
        { checkpoint: 'ARRIVED' },
        driverUser,
      );

      expect(tracking.recordTrackingEvent).toHaveBeenCalledTimes(1);
      expect(tracking.recordTrackingEvent).toHaveBeenCalledWith(
        'tenant-1',
        'note-2',
        { checkpoint: 'ARRIVED' },
        'user-driver',
        ['logistics:track'],
      );
      expect(result).toEqual({ marked: 1 });
    });

    it('says so when every order already has it', async () => {
      routes.findCustomerStopsOnTheWay.mockResolvedValue([notes()[0]]);

      await expect(
        service.markCheckpoint(
          'tenant-1',
          'route-1',
          'cust-1',
          { checkpoint: 'ARRIVED' },
          driverUser,
        ),
      ).rejects.toThrow(/ya tienen ese estado/);
      expect(tracking.recordTrackingEvent).not.toHaveBeenCalled();
    });
  });

  describe('fail', () => {
    it('sends every order of the customer back with the same reason', async () => {
      const dto = { reason: 'ABSENT' as const, note: 'Vuelve el lunes' };

      const result = await service.fail(
        'tenant-1',
        'route-1',
        'cust-1',
        dto,
        driverUser,
      );

      expect(routesService.failDelivery.mock.calls).toEqual([
        ['tenant-1', 'note-1', dto, driverUser],
        ['tenant-1', 'note-2', dto, driverUser],
      ]);
      expect(result).toEqual({ failed: 2 });
    });
  });
});
