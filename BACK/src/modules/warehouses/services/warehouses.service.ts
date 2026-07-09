import { Injectable, NotFoundException } from '@nestjs/common';
import { WarehousesRepository } from '../repositories/warehouses.repository';
import { CreateWarehouseDto } from '../dto/create-warehouse.dto';
import { UpdateWarehouseDto } from '../dto/update-warehouse.dto';

@Injectable()
export class WarehousesService {
  constructor(private readonly warehousesRepository: WarehousesRepository) {}

  findAll(tenantId: string) {
    return this.warehousesRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const warehouse = await this.warehousesRepository.findById(tenantId, id);
    if (!warehouse) throw new NotFoundException('Depósito no encontrado');
    return warehouse;
  }

  create(tenantId: string, dto: CreateWarehouseDto) {
    return this.warehousesRepository.create(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: UpdateWarehouseDto) {
    await this.findOne(tenantId, id);
    return this.warehousesRepository.update(tenantId, id, dto);
  }
}
