import { Global, Module } from '@nestjs/common';
import { WAREHOUSE_SETUP } from '../../common/contracts/warehouse-setup.contract';
import { WarehousesRepository } from './repositories/warehouses.repository';

/** Lo que Depósitos ofrece a la plataforma y a otros módulos por contrato. */
@Global()
@Module({
  providers: [
    WarehousesRepository,
    { provide: WAREHOUSE_SETUP, useExisting: WarehousesRepository },
  ],
  exports: [WAREHOUSE_SETUP],
})
export class WarehousesContractsModule {}
