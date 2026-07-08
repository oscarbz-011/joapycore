import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const SUPPLIER_SELECT = {
  id: true,
  name: true,
  contactName: true,
  email: true,
  phone: true,
};

@Injectable()
export class ProductSuppliersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProduct(tenantId: string, productId: string) {
    return this.prisma.productSupplier.findMany({
      where: { tenantId, productId },
      include: { supplier: { select: SUPPLIER_SELECT } },
      orderBy: [{ isPreferred: 'desc' }, { createdAt: 'asc' }],
    });
  }

  findOne(tenantId: string, productId: string, supplierId: string) {
    return this.prisma.productSupplier.findFirst({
      where: { tenantId, productId, supplierId },
      include: { supplier: { select: SUPPLIER_SELECT } },
    });
  }

  supplierExistsForTenant(tenantId: string, supplierId: string) {
    return this.prisma.supplier.findFirst({
      where: { tenantId, id: supplierId, isActive: true, deletedAt: null },
      select: { id: true },
    });
  }

  create(
    tenantId: string,
    productId: string,
    supplierId: string,
    data: { costPrice?: number | null; isPreferred?: boolean },
  ) {
    return this.prisma.productSupplier.create({
      data: { tenantId, productId, supplierId, ...data },
      include: { supplier: { select: SUPPLIER_SELECT } },
    });
  }

  update(
    tenantId: string,
    productId: string,
    supplierId: string,
    data: { costPrice?: number | null; isPreferred?: boolean },
  ) {
    return this.prisma.productSupplier.updateMany({
      where: { tenantId, productId, supplierId },
      data,
    });
  }

  delete(tenantId: string, productId: string, supplierId: string) {
    return this.prisma.productSupplier.deleteMany({
      where: { tenantId, productId, supplierId },
    });
  }

  clearPreferred(tenantId: string, productId: string) {
    return this.prisma.productSupplier.updateMany({
      where: { tenantId, productId, isPreferred: true },
      data: { isPreferred: false },
    });
  }
}
