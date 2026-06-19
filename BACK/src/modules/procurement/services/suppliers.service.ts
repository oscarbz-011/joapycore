import { Injectable, NotFoundException } from '@nestjs/common';
import { SuppliersRepository } from '../repositories/suppliers.repository';
import { CreateSupplierDto } from '../dto/create-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private readonly suppliersRepository: SuppliersRepository) {}

  findAll(tenantId: string) {
    return this.suppliersRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const supplier = await this.suppliersRepository.findById(tenantId, id);
    if (!supplier) throw new NotFoundException('Supplier not found');
    return supplier;
  }

  create(tenantId: string, dto: CreateSupplierDto) {
    return this.suppliersRepository.create(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: Partial<CreateSupplierDto>) {
    await this.findOne(tenantId, id);
    await this.suppliersRepository.update(tenantId, id, dto);
    return this.suppliersRepository.findById(tenantId, id);
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.suppliersRepository.softDelete(tenantId, id);
  }
}
