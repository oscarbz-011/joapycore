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
    opts: { purchaseOrderItemId?: string; purchaseReceiptItemId?: string } = {},
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productUnit.createMany({
      data: serials.map((serialNumber) => ({
        tenantId,
        productId,
        serialNumber,
        purchaseOrderItemId: opts.purchaseOrderItemId,
        purchaseReceiptItemId: opts.purchaseReceiptItemId,
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

  findBySerialForUpdate(
    tenantId: string,
    productId: string,
    serialNumber: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productUnit.findUnique({
      where: {
        tenantId_productId_serialNumber: { tenantId, productId, serialNumber },
      },
    });
  }

  assignToSaleItem(
    id: string,
    saleOrderItemId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productUnit.update({
      where: { id },
      data: { saleOrderItemId },
    });
  }

  detachFromSaleItems(
    saleOrderItemIds: string[],
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productUnit.updateMany({
      where: { saleOrderItemId: { in: saleOrderItemIds } },
      data: { saleOrderItemId: null },
    });
  }

  markSoldBySaleItem(
    tenantId: string,
    saleOrderItemId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productUnit.updateMany({
      where: { saleOrderItemId, tenantId },
      data: { status: 'SOLD' },
    });
  }

  /** Anulación: las unidades vuelven a stock y se desvinculan de la venta. */
  restoreBySaleItem(
    tenantId: string,
    saleOrderItemId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productUnit.updateMany({
      where: { tenantId, saleOrderItemId },
      data: { status: 'IN_STOCK', saleOrderItemId: null },
    });
  }

  async existsForReceiptItems(
    tenantId: string,
    purchaseReceiptItemIds: string[],
    client: PrismaClientOrTx = this.prisma,
  ): Promise<boolean> {
    const row = await client.productUnit.findFirst({
      where: {
        tenantId,
        purchaseReceiptItemId: { in: purchaseReceiptItemIds },
      },
      select: { id: true },
    });
    return row !== null;
  }
}
