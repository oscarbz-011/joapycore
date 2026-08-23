import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { CombosController } from './controllers/combos.controller';
import { CustomersController } from './controllers/customers.controller';
import { SaleOrdersController } from './controllers/sale-orders.controller';
import { SaleTargetsController } from './controllers/sale-targets.controller';
import { SalesOnDeliveryListener } from './events/sales-on-delivery.listener';
import { SalesOnInvoiceListener } from './events/sales-on-invoice.listener';
import { CombosRepository } from './repositories/combos.repository';
import { CustomersRepository } from './repositories/customers.repository';
import { GuarantorsRepository } from './repositories/guarantors.repository';
import { SaleOrdersRepository } from './repositories/sale-orders.repository';
import { SaleTargetsRepository } from './repositories/sale-targets.repository';
import { CombosService } from './services/combos.service';
import { CreditEvaluationService } from './services/credit-evaluation.service';
import { CustomersService } from './services/customers.service';
import { SaleOrdersService } from './services/sale-orders.service';
import { SaleTargetsService } from './services/sale-targets.service';

@Module({
  imports: [InventoryModule],
  controllers: [
    CustomersController,
    SaleOrdersController,
    SaleTargetsController,
    CombosController,
  ],
  providers: [
    CustomersService,
    SaleOrdersService,
    SaleTargetsService,
    CreditEvaluationService,
    CombosService,
    CustomersRepository,
    SaleOrdersRepository,
    SaleTargetsRepository,
    GuarantorsRepository,
    CombosRepository,
    SalesOnDeliveryListener,
    SalesOnInvoiceListener,
  ],
  exports: [SaleOrdersRepository, SaleOrdersService],
})
export class SalesModule {}
