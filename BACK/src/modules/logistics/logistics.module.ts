import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { DeliveryNotesRepository } from './repositories/delivery-notes.repository';
import { LogisticsSourcesRepository } from './repositories/logistics-sources.repository';
import { DeliveryTrackingEventsRepository } from './repositories/delivery-tracking-events.repository';
import { DeliveryNotesService } from './services/delivery-notes.service';
import { DeliveryTrackingService } from './services/delivery-tracking.service';
import { DeliveryNotesController } from './controllers/delivery-notes.controller';
import { DeliveryTrackingController } from './controllers/delivery-tracking.controller';
import { DeliveryMethodsController } from './controllers/delivery-methods.controller';
import { DeliveryMethodsService } from './services/delivery-methods.service';
import { DeliveryRoutesController } from './controllers/delivery-routes.controller';
import { DeliveryRoutesRepository } from './repositories/delivery-routes.repository';
import { DeliveryRoutesService } from './services/delivery-routes.service';
import { DeliveryRouteCustomerStopsService } from './services/delivery-route-customer-stops.service';
import { LogisticsOnSaleCompletedListener } from './events/logistics-on-sale-completed.listener';
import { LogisticsRouteProgressListener } from './events/logistics-route-progress.listener';
import { LogisticsOnModuleActivatedListener } from './events/logistics-on-module-activated.listener';
import { TenantsModule } from '../../tenants/tenants.module';

// Orden de controllers importa: DeliveryTrackingController declara rutas
// literales bajo /logistics/deliveries/* (p.ej. GET .../mine) que Express
// resuelve por orden de registro — si DeliveryNotesController fuera primero,
// su GET /logistics/deliveries/:id capturaría ".../mine" como id="mine"
// antes de que la ruta específica llegue a evaluarse (bug real encontrado en
// vivo: GET /logistics/deliveries/mine devolvía 404 "Nota de entrega no
// encontrada" en vez de la lista del repartidor).
@Module({
  imports: [TenantsModule],
  // DeliveryMethodsController también va antes: declara by-order/:saleOrderId.
  controllers: [
    DeliveryTrackingController,
    DeliveryMethodsController,
    DeliveryNotesController,
    DeliveryRoutesController,
  ],
  providers: [
    DeliveryNotesService,
    DeliveryTrackingService,
    DeliveryMethodsService,
    DeliveryRoutesService,
    DeliveryRouteCustomerStopsService,
    DeliveryNotesRepository,
    DeliveryRoutesRepository,
    DeliveryTrackingEventsRepository,
    LogisticsSourcesRepository,
    LogisticsOnSaleCompletedListener,
    LogisticsRouteProgressListener,
    LogisticsOnModuleActivatedListener,
  ],
})
export class LogisticsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(LogisticsModule.name);

  constructor(private readonly deliveryNotes: DeliveryNotesService) {}

  async onApplicationBootstrap() {
    try {
      // Pedidos confirmados sin nota (de antes de que existiera la nota, o de
      // un listener que falló), solo en tenants con Logística activa.
      const created = await this.deliveryNotes.backfillPending();
      if (created > 0) {
        this.logger.log(`Backfilled ${created} delivery note(s)`);
      }
    } catch (err) {
      this.logger.warn(
        `Delivery note backfill skipped: ${(err as Error).message}`,
      );
    }
  }
}
