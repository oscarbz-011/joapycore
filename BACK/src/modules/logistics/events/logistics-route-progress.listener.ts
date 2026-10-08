import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DeliveryRoutesService } from '../services/delivery-routes.service';

interface DeliveryNoteDeliveredEvent {
  tenantId: string;
  deliveryNoteId: string;
  userId?: string;
}

/**
 * Una entrega se puede marcar entregada desde varios lugares (el repartidor,
 * logística, el recorrido). Escuchar el evento deja el avance de la ruta en un
 * solo sitio, sin que cada uno de esos caminos sepa de rutas.
 */
@Injectable()
export class LogisticsRouteProgressListener {
  private readonly logger = new Logger(LogisticsRouteProgressListener.name);

  constructor(private readonly routes: DeliveryRoutesService) {}

  @OnEvent('delivery.note.delivered')
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
