import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreateCustomerDto } from '../dto/create-customer.dto';

@Injectable()
export class CustomersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.customer.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { lastName: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.customer.findFirst({ where: { id, tenantId, deletedAt: null } });
  }

  create(tenantId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({ data: { tenantId, ...dto } });
  }

  update(tenantId: string, id: string, dto: Partial<CreateCustomerDto>) {
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  softDelete(tenantId: string, id: string) {
    return this.prisma.customer.update({ where: { id }, data: { deletedAt: new Date() } });
  }
}
