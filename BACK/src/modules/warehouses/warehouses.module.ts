import { Module } from '@nestjs/common';
import { WarehousesController } from './controllers/warehouses.controller';
import { WarehousesRepository } from './repositories/warehouses.repository';
import { WarehousesService } from './services/warehouses.service';

@Module({
  controllers: [WarehousesController],
  providers: [WarehousesService, WarehousesRepository],
  exports: [WarehousesService, WarehousesRepository],
})
export class WarehousesModule {}
