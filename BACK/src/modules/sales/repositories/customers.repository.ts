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
    return this.prisma.customer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  findByEmail(tenantId: string, email: string, excludeId?: string) {
    return this.prisma.customer.findFirst({
      where: {
        tenantId,
        email,
        deletedAt: null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
  }

  findLastCode(tenantId: string) {
    return this.prisma.customer.findFirst({
      where: { tenantId, customerCode: { startsWith: 'CLI-' } },
      orderBy: { customerCode: 'desc' },
      select: { customerCode: true },
    });
  }

  create(tenantId: string, dto: CreateCustomerDto & { customerCode?: string }) {
    return this.prisma.customer.create({ data: { tenantId, ...dto } });
  }

  update(tenantId: string, id: string, dto: Partial<CreateCustomerDto>) {
    return this.prisma.customer.update({ where: { id }, data: dto });
  }

  softDelete(tenantId: string, id: string) {
    return this.prisma.customer.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
