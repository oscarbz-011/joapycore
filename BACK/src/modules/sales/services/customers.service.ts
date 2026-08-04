import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomersRepository } from '../repositories/customers.repository';
import { CreateCustomerDto } from '../dto/create-customer.dto';
import { toTitleCase } from '../../../common/utils/normalize.util';

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepository: CustomersRepository) {}

  findAll(tenantId: string) {
    return this.customersRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const customer = await this.customersRepository.findById(tenantId, id);
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto) {
    const customerCode = await this.generateCustomerCode(tenantId);
    return this.customersRepository.create(tenantId, {
      ...dto,
      firstName: toTitleCase(dto.firstName),
      lastName: toTitleCase(dto.lastName),
      customerCode,
    });
  }

  async update(tenantId: string, id: string, dto: Partial<CreateCustomerDto>) {
    await this.findOne(tenantId, id);
    return this.customersRepository.update(tenantId, id, {
      ...dto,
      ...(dto.firstName ? { firstName: toTitleCase(dto.firstName) } : {}),
      ...(dto.lastName ? { lastName: toTitleCase(dto.lastName) } : {}),
    });
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.customersRepository.softDelete(tenantId, id);
  }

  private async generateCustomerCode(tenantId: string): Promise<string> {
    const year = String(new Date().getFullYear()).slice(-2);
    const last = await this.customersRepository.findLastCode(tenantId);
    if (!last?.customerCode) return `CLI-${year}-000001`;
    const match = last.customerCode.match(/^CLI-\d{2}-(\d+)$/);
    if (!match) return `CLI-${year}-000001`;
    const next = parseInt(match[1], 10) + 1;
    return `CLI-${year}-${String(next).padStart(6, '0')}`;
  }
}
