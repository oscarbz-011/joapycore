import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export type PresentationData = Omit<
  Prisma.ProductPresentationUncheckedCreateInput,
  'id' | 'tenantId' | 'productId' | 'createdAt' | 'updatedAt'
>;

@Injectable()
export class ProductPresentationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProduct(tenantId: string, productId: string) {
    return this.prisma.productPresentation.findMany({
      where: { tenantId, productId },
      orderBy: [{ isActive: 'desc' }, { factor: 'asc' }, { name: 'asc' }],
    });
  }

  findOne(tenantId: string, productId: string, id: string) {
    return this.prisma.productPresentation.findFirst({
      where: { tenantId, productId, id },
    });
  }

  create(tenantId: string, productId: string, data: PresentationData) {
    return this.prisma.productPresentation.create({
      data: { tenantId, productId, ...data },
    });
  }

  async update(
    tenantId: string,
    productId: string,
    id: string,
    data: Partial<PresentationData>,
  ) {
    await this.prisma.productPresentation.updateMany({
      where: { tenantId, productId, id },
      data,
    });
    return this.findOne(tenantId, productId, id);
  }
}
