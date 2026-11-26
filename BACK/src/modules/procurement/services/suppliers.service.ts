import { Injectable, NotFoundException } from '@nestjs/common';
import { SuppliersRepository } from '../repositories/suppliers.repository';
import {
  CreateSupplierDto,
  UpdateSupplierDto,
} from '../dto/create-supplier.dto';
import {
  normalizeQuantityDiscounts,
  normalizeVolumeDiscounts,
} from '../commercial-terms.util';

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
    const { volumeDiscounts, quantityDiscounts, ...fields } = dto;
    return this.suppliersRepository.create(tenantId, fields, {
      volumeDiscounts: normalizeVolumeDiscounts(volumeDiscounts),
      quantityDiscounts: normalizeQuantityDiscounts(quantityDiscounts),
    });
  }

  async update(tenantId: string, id: string, dto: UpdateSupplierDto) {
    await this.findOne(tenantId, id);
    const { volumeDiscounts, quantityDiscounts, ...fields } = dto;
    await this.suppliersRepository.update(tenantId, id, fields, {
      // undefined = no se tocan; un arreglo (aunque vacío) los reemplaza.
      ...(volumeDiscounts !== undefined && {
        volumeDiscounts: normalizeVolumeDiscounts(volumeDiscounts),
      }),
      ...(quantityDiscounts !== undefined && {
        quantityDiscounts: normalizeQuantityDiscounts(quantityDiscounts),
      }),
    });
    return this.suppliersRepository.findById(tenantId, id);
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.suppliersRepository.softDelete(tenantId, id);
  }
}
