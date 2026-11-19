import { Global, Module } from '@nestjs/common';
import { PURCHASE_ORDER_PDF } from '../../common/contracts/document-pdf.contract';
import { PurchaseOrdersRepository } from './repositories/purchase-orders.repository';

/** Lo que Compras ofrece a otros módulos por contrato, sin importar ProcurementModule. */
@Global()
@Module({
  providers: [
    PurchaseOrdersRepository,
    { provide: PURCHASE_ORDER_PDF, useExisting: PurchaseOrdersRepository },
  ],
  exports: [PURCHASE_ORDER_PDF],
})
export class ProcurementContractsModule {}
