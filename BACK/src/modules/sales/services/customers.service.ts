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

  create(tenantId: string, dto: CreateCustomerDto) {
    return this.customersRepository.create(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: Partial<CreateCustomerDto>) {
    await this.findOne(tenantId, id);
    return this.customersRepository.update(tenantId, id, dto);
  }

  async delete(tenantId: string, id: string) {
    await this.findOne(tenantId, id);
    return this.customersRepository.softDelete(tenantId, id);
  }
}
