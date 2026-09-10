import { Module } from '@nestjs/common';
import { ProductComponentsController } from './controllers/product-components.controller';
import { ProductionOrdersController } from './controllers/production-orders.controller';
import { ProductComponentsRepository } from './repositories/product-components.repository';
import { ProductionOrdersRepository } from './repositories/production-orders.repository';
import { ProductComponentsService } from './services/product-components.service';
import { ProductionOrdersService } from './services/production-orders.service';

// Sin imports de otros módulos de negocio: al completarse una orden se emite
// `production.order.completed` e inventory reacciona con su propio listener
// para generar los movimientos de stock — producción no toca stock_movement
// ni conoce las tablas de inventory.
@Module({
  controllers: [ProductComponentsController, ProductionOrdersController],
  providers: [
    ProductComponentsService,
    ProductionOrdersService,
    ProductComponentsRepository,
    ProductionOrdersRepository,
  ],
})
export class ProductionModule {}
