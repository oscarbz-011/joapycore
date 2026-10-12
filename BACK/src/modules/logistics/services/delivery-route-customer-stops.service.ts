import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  CustomerCheckpointDto,
  DeliverCustomerStopDto,
  FailDeliveryDto,
} from '../dto/delivery-route.dto';
import { DeliveryRoutesRepository } from '../repositories/delivery-routes.repository';
import {
  DeliveryRoutesService,
  type RouteActor,
} from './delivery-routes.service';
import { DeliveryTrackingService } from './delivery-tracking.service';

/**
 * Varios pedidos del mismo cliente en una ruta son una sola parada para el
 * repartidor: llega una vez, entrega todo junto y confirma una vez. Acá se
 * aplica a todos esos pedidos lo que el repartidor hace con la parada.
 *
 * Cada pedido pasa por el mismo camino que cuando se actualiza solo (permisos,
 * stock, avance de la ruta), así que no hay reglas duplicadas.
 */
@Injectable()
export class DeliveryRouteCustomerStopsService {
  constructor(
    private readonly routes: DeliveryRoutesRepository,
    private readonly tracking: DeliveryTrackingService,
    private readonly routesService: DeliveryRoutesService,
  ) {}

  /** Entrega todos los pedidos en camino del cliente en la ruta. */
  async deliver(
    tenantId: string,
    routeId: string,
    customerId: string,
    dto: DeliverCustomerStopDto,
    actor: RouteActor,
  ) {
    const notes = await this.onTheWay(tenantId, routeId, customerId);
    for (const note of notes) {
      await this.tracking.recordTrackingEvent(
        tenantId,
        note.id,
        { ...dto, checkpoint: 'DELIVERED' },
        actor.userId,
        actor.permissions,
      );
    }
    return { delivered: notes.length };
  }

  /** Marca un hito en los pedidos del cliente que todavía no lo tienen. */
  async markCheckpoint(
    tenantId: string,
    routeId: string,
    customerId: string,
    dto: CustomerCheckpointDto,
    actor: RouteActor,
  ) {
    const notes = await this.onTheWay(tenantId, routeId, customerId);
    const missing = notes.filter(
      (note) =>
        !note.trackingEvents.some(
          (event) => event.checkpoint === dto.checkpoint,
        ),
    );
    if (missing.length === 0) {
      throw new UnprocessableEntityException(
        'Los pedidos de este cliente ya tienen ese estado',
      );
    }
    for (const note of missing) {
      await this.tracking.recordTrackingEvent(
        tenantId,
        note.id,
        { checkpoint: dto.checkpoint },
        actor.userId,
        actor.permissions,
      );
    }
    return { marked: missing.length };
  }

  /** No se pudo entregar: todos los pedidos del cliente vuelven a pendiente. */
  async fail(
    tenantId: string,
    routeId: string,
    customerId: string,
    dto: FailDeliveryDto,
    actor: RouteActor,
  ) {
    const notes = await this.onTheWay(tenantId, routeId, customerId);
    for (const note of notes) {
      await this.routesService.failDelivery(tenantId, note.id, dto, actor);
    }
    return { failed: notes.length };
  }

  private async onTheWay(
    tenantId: string,
    routeId: string,
    customerId: string,
  ) {
    const route = await this.routes.findById(tenantId, routeId);
    if (!route) throw new NotFoundException('Ruta no encontrada');
    const notes = await this.routes.findCustomerStopsOnTheWay(
      tenantId,
      routeId,
      customerId,
    );
    if (notes.length === 0) {
      throw new UnprocessableEntityException(
        'Este cliente no tiene pedidos en camino en la ruta',
      );
    }
    return notes;
  }
}
