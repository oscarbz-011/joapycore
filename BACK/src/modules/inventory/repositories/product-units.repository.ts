import { Injectable } from '@nestjs/common';
import { ProductUnitStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class ProductUnitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProduct(
    tenantId: string,
    productId: string,
    status?: ProductUnitStatus,
  ) {
    return this.prisma.productUnit.findMany({
      where: { tenantId, productId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  findBySerial(tenantId: string, productId: string, serialNumber: string) {
    return this.prisma.productUnit.findUnique({
      where: {
        tenantId_productId_serialNumber: { tenantId, productId, serialNumber },
      },
    });
  }

  createMany(
    tenantId: string,
    productId: string,
    serials: string[],
    purchaseOrderItemId?: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productUnit.createMany({
      data: serials.map((serialNumber) => ({
        tenantId,
        productId,
        serialNumber,
        purchaseOrderItemId,
      })),
      skipDuplicates: true,
    });
  }

  updateStatus(
    tenantId: string,
    id: string,
    status: ProductUnitStatus,
    saleOrderItemId?: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productUnit.update({
      where: { id },
      data: { status, ...(saleOrderItemId && { saleOrderItemId }) },
    });
  }
}
