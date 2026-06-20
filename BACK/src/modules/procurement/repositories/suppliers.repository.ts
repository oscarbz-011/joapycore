import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class SuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.supplier.findFirst({
      where: { tenantId, id, deletedAt: null },
    });
  }

  create(
    tenantId: string,
    data: Omit<Prisma.SupplierUncheckedCreateInput, 'tenantId'>,
  ) {
    return this.prisma.supplier.create({ data: { ...data, tenantId } });
  }

  update(tenantId: string, id: string, data: Prisma.SupplierUpdateInput) {
    return this.prisma.supplier.updateMany({
      where: { tenantId, id, deletedAt: null },
      data,
    });
  }

  softDelete(tenantId: string, id: string) {
    return this.prisma.supplier.updateMany({
      where: { tenantId, id },
      data: { deletedAt: new Date(), isActive: false },
    });
  }
}
