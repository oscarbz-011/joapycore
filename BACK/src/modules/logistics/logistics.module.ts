import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DeliveryNotesRepository } from './repositories/delivery-notes.repository';
import { DeliveryTrackingEventsRepository } from './repositories/delivery-tracking-events.repository';
import { DeliveryNotesService } from './services/delivery-notes.service';
import { DeliveryTrackingService } from './services/delivery-tracking.service';
import { DeliveryNotesController } from './controllers/delivery-notes.controller';
import { DeliveryTrackingController } from './controllers/delivery-tracking.controller';

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
  ],
})
export class LogisticsModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(LogisticsModule.name);

  constructor(private readonly prisma: PrismaService) {}

  async onApplicationBootstrap() {
    try {
      // Backfill: create PENDING delivery notes for CONFIRMED/INVOICED orders
      // that don't have one yet (orders confirmed before this feature existed).
      const orders = await this.prisma.saleOrder.findMany({
        where: {
          status: { in: ['CONFIRMED', 'INVOICED'] },
          deliveryNote: null,
        },
        select: { id: true, tenantId: true },
      });

      if (orders.length === 0) return;

      this.logger.log(`Backfilling ${orders.length} delivery note(s) for confirmed orders without one`);

      for (const order of orders) {
        await this.prisma.deliveryNote.create({
          data: {
            tenantId: order.tenantId,
            saleOrderId: order.id,
            status: 'PENDING',
            issuedAt: new Date(),
          },
        });
      }
    } catch (err) {
      this.logger.warn(`Delivery note backfill skipped: ${(err as Error).message}`);
    }
  }
}
