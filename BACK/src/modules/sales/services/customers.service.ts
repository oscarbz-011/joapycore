import { Injectable, NotFoundException } from '@nestjs/common';
import { CustomersRepository } from '../repositories/customers.repository';
import { CreateCustomerDto } from '../dto/create-customer.dto';

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
    return this.customersRepository.create(tenantId, { ...dto, customerCode });
  }

  async update(tenantId: string, id: string, dto: Partial<CreateCustomerDto>) {
    await this.findOne(tenantId, id);
    return this.customersRepository.update(tenantId, id, dto);
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.customersRepository.softDelete(tenantId, id);
  }

  private async generateCustomerCode(tenantId: string): Promise<string> {
    const last = await this.customersRepository.findLastCode(tenantId);
    if (!last?.customerCode) return 'CLI-001';
    const match = last.customerCode.match(/^CLI-(\d+)$/);
    if (!match) return 'CLI-001';
    const next = parseInt(match[1], 10) + 1;
    return `CLI-${String(next).padStart(3, '0')}`;
  }
}
