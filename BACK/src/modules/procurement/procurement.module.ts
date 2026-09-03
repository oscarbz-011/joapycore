import { Module } from '@nestjs/common';
import { PurchaseOrdersController } from './controllers/purchase-orders.controller';
import { PurchaseReceiptsController } from './controllers/purchase-receipts.controller';
import { SuppliersController } from './controllers/suppliers.controller';
import { PayablesController } from './controllers/payables.controller';
import { PurchaseOrdersRepository } from './repositories/purchase-orders.repository';
import { PurchaseReceiptsRepository } from './repositories/purchase-receipts.repository';
import { SuppliersRepository } from './repositories/suppliers.repository';
import { AccountsPayableRepository } from './repositories/accounts-payable.repository';
import { SupplierPaymentsRepository } from './repositories/supplier-payments.repository';
import { PurchaseOrdersService } from './services/purchase-orders.service';
import { PurchaseReceiptsService } from './services/purchase-receipts.service';
import { SuppliersService } from './services/suppliers.service';
import { PayablesService } from './services/payables.service';
import { ProcurementOnReceiptListener } from './events/procurement-on-receipt.listener';

// Sin imports de otros módulos de negocio: la recepción de compra emite
// `purchase.receipt.created` y tanto inventory (stock) como el propio
// procurement (AccountsPayable, ver ProcurementOnReceiptListener) reaccionan
// cada uno con su propio listener — procurement no conoce ni toca tablas de
// inventory.
@Module({
  controllers: [
    SuppliersController,
    PurchaseOrdersController,
    PurchaseReceiptsController,
    PayablesController,
  ],
  providers: [
    SuppliersService,
    PurchaseOrdersService,
    PurchaseReceiptsService,
    PayablesService,
    SuppliersRepository,
    PurchaseOrdersRepository,
    PurchaseReceiptsRepository,
    AccountsPayableRepository,
    SupplierPaymentsRepository,
    ProcurementOnReceiptListener,
  ],
})
export class ProcurementModule {}
