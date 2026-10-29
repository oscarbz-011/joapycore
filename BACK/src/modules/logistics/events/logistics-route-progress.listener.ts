import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { DeliveryRoutesService } from '../services/delivery-routes.service';
import type { DomainEvents } from '../../../common/events/domain-events';

type DeliveryNoteDeliveredEvent = DomainEvents['delivery.note.delivered'];

/**
 * Una entrega se puede marcar entregada desde varios lugares (el repartidor,
 * logística, el recorrido). Escuchar el evento deja el avance de la ruta en un
 * solo sitio, sin que cada uno de esos caminos sepa de rutas.
 */
@Injectable()
export class LogisticsRouteProgressListener {
  private readonly logger = new Logger(LogisticsRouteProgressListener.name);

  constructor(private readonly routes: DeliveryRoutesService) {}

  @OnDomainEvent('delivery.note.delivered')
  async handle(event: DeliveryNoteDeliveredEvent) {
    try {
      await this.routes.stopDelivered(
        event.tenantId,
        event.deliveryNoteId,
        event.userId,
      );
    } catch (error) {
      // La entrega ya quedó entregada: que falle el avance de la ruta no la deshace.
      this.logger.error(
        `No se pudo actualizar la ruta de la entrega ${event.deliveryNoteId}: ${(error as Error).message}`,
      );
    }
  }
}
