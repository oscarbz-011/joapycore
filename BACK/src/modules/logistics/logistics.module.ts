import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DeliveryNotesRepository } from './repositories/delivery-notes.repository';
import { LogisticsSourcesRepository } from './repositories/logistics-sources.repository';
import { DeliveryTrackingEventsRepository } from './repositories/delivery-tracking-events.repository';
import { DeliveryNotesService } from './services/delivery-notes.service';
import { DeliveryTrackingService } from './services/delivery-tracking.service';
import { DeliveryNotesController } from './controllers/delivery-notes.controller';
import { DeliveryTrackingController } from './controllers/delivery-tracking.controller';
import { LogisticsOnSaleCompletedListener } from './events/logistics-on-sale-completed.listener';

// Orden de controllers importa: DeliveryTrackingController declara rutas
// literales bajo /logistics/deliveries/* (p.ej. GET .../mine) que Express
// resuelve por orden de registro — si DeliveryNotesController fuera primero,
// su GET /logistics/deliveries/:id capturaría ".../mine" como id="mine"
// antes de que la ruta específica llegue a evaluarse (bug real encontrado en
// vivo: GET /logistics/deliveries/mine devolvía 404 "Nota de entrega no
// encontrada" en vez de la lista del repartidor).
@Module({
  controllers: [DeliveryTrackingController, DeliveryNotesController],
  providers: [
    DeliveryNotesService,
    DeliveryTrackingService,
    DeliveryNotesRepository,
    DeliveryTrackingEventsRepository,
    LogisticsSourcesRepository,
    LogisticsOnSaleCompletedListener,
  ],
})
export class LogisticsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(LogisticsModule.name);

  constructor(
    private readonly sources: LogisticsSourcesRepository,
    private readonly deliveryNotesRepository: DeliveryNotesRepository,
  ) {}

  async onApplicationBootstrap() {
    try {
      // Backfill: create PENDING delivery notes for CONFIRMED/INVOICED orders
      // that don't have one yet (orders confirmed before this feature existed).
      const orders =
        await this.sources.findConfirmedOrdersWithoutDeliveryNote();

      if (orders.length === 0) return;

      this.logger.log(
        `Backfilling ${orders.length} delivery note(s) for confirmed orders without one`,
      );

      for (const order of orders) {
        await this.deliveryNotesRepository.ensurePendingForOrder(
          order.tenantId,
          order.id,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Delivery note backfill skipped: ${(err as Error).message}`,
      );
    }
  }
}
