import { Global, Module } from '@nestjs/common';
import { PURCHASE_ORDER_PDF } from '../../common/contracts/document-pdf.contract';
import { SUPPLIER_DIRECTORY } from '../../common/contracts/supplier-directory.contract';
import { TenantsModule } from '../../tenants/tenants.module';
import { PurchaseOrdersRepository } from './repositories/purchase-orders.repository';
import { SuppliersRepository } from './repositories/suppliers.repository';
import { SupplierDirectoryService } from './services/supplier-directory.service';

/** Lo que Compras ofrece a otros módulos por contrato, sin importar ProcurementModule. */
@Global()
@Module({
  imports: [TenantsModule],
  providers: [
    PurchaseOrdersRepository,
    SuppliersRepository,
    SupplierDirectoryService,
    { provide: PURCHASE_ORDER_PDF, useExisting: PurchaseOrdersRepository },
    { provide: SUPPLIER_DIRECTORY, useExisting: SupplierDirectoryService },
  ],
  exports: [PURCHASE_ORDER_PDF, SUPPLIER_DIRECTORY],
})
export class ProcurementContractsModule {}
