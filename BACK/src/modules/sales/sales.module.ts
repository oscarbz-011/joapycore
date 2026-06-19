import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { CustomersController } from './controllers/customers.controller';
import { SaleOrdersController } from './controllers/sale-orders.controller';
import { CustomersRepository } from './repositories/customers.repository';
import { SaleOrdersRepository } from './repositories/sale-orders.repository';
import { CustomersService } from './services/customers.service';
import { SaleOrdersService } from './services/sale-orders.service';

@Module({
  imports: [InventoryModule],
  controllers: [CustomersController, SaleOrdersController],
  providers: [
    CustomersService,
    SaleOrdersService,
    CustomersRepository,
    SaleOrdersRepository,
  ],
  exports: [SaleOrdersRepository],
})
export class SalesModule {}
