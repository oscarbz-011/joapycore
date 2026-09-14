import { Global, Module } from '@nestjs/common';
import { SALES_GATEWAY } from '../../common/contracts/sales-gateway.contract';
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
import { CreditSourcesRepository } from './repositories/credit-sources.repository';

// Global solo para exponer SALES_GATEWAY (lo usa POS sin importar este
// módulo). Inventario llega por los contratos de InventoryContractsModule.
@Global()
@Module({
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
    CreditSourcesRepository,
    SalesOnDeliveryListener,
    SalesOnInvoiceListener,
    { provide: SALES_GATEWAY, useExisting: SaleOrdersService },
  ],
  exports: [SALES_GATEWAY],
})
export class SalesModule {}
