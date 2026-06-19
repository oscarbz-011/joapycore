import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { PurchaseOrdersController } from './controllers/purchase-orders.controller';
import { SuppliersController } from './controllers/suppliers.controller';
import { PurchaseOrdersRepository } from './repositories/purchase-orders.repository';
import { SuppliersRepository } from './repositories/suppliers.repository';
import { PurchaseOrdersService } from './services/purchase-orders.service';
import { SuppliersService } from './services/suppliers.service';

@Module({
  imports: [InventoryModule],
  controllers: [SuppliersController, PurchaseOrdersController],
  providers: [
    SuppliersService,
    PurchaseOrdersService,
    SuppliersRepository,
    PurchaseOrdersRepository,
  ],
})
export class ProcurementModule {}
