import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { CustomersController } from './controllers/customers.controller';
import { SaleOrdersController } from './controllers/sale-orders.controller';
import { SaleTargetsController } from './controllers/sale-targets.controller';
import { CustomersRepository } from './repositories/customers.repository';
import { SaleOrdersRepository } from './repositories/sale-orders.repository';
import { SaleTargetsRepository } from './repositories/sale-targets.repository';
import { CustomersService } from './services/customers.service';
import { SaleOrdersService } from './services/sale-orders.service';
import { SaleTargetsService } from './services/sale-targets.service';

@Module({
  imports: [InventoryModule],
  controllers: [CustomersController, SaleOrdersController, SaleTargetsController],
  providers: [
    CustomersService,
    SaleOrdersService,
    SaleTargetsService,
    CustomersRepository,
    SaleOrdersRepository,
    SaleTargetsRepository,
  ],
  exports: [SaleOrdersRepository],
})
export class SalesModule {}
