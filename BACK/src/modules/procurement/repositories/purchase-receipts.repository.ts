import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

const WITH_RELATIONS = {
  items: {
    include: { product: { select: { id: true, name: true, model: true } } },
  },
  warehouse: { select: { id: true, name: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
} as const;

@Injectable()
export class PurchaseReceiptsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async nextReceiptNumber(
    tenantId: string,
    client: PrismaClientOrTx = this.prisma,
  ): Promise<number> {
    const last = await client.purchaseReceipt.findFirst({
      where: { tenantId },
      orderBy: { receiptNumber: 'desc' },
      select: { receiptNumber: true },
    });
    return (last?.receiptNumber ?? 0) + 1;
  }

  create(
    tenantId: string,
    data: Omit<Prisma.PurchaseReceiptUncheckedCreateInput, 'tenantId'>,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.purchaseReceipt.create({
      data: { ...data, tenantId },
      include: WITH_RELATIONS,
    });
  }

  // Lo necesario para generar la cuenta por pagar de una recepción.
  findForPayable(tenantId: string, id: string) {
    return this.prisma.purchaseReceipt.findFirst({
      where: { id, tenantId },
      include: {
        items: { select: { quantity: true, unitCost: true } },
        purchaseOrder: {
          select: {
            supplierId: true,
            supplier: { select: { paymentTermDays: true } },
          },
        },
      },
    });
  }

  findByOrder(tenantId: string, purchaseOrderId: string) {
    return this.prisma.purchaseReceipt.findMany({
      where: { tenantId, purchaseOrderId },
      include: WITH_RELATIONS,
      orderBy: { receivedAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.purchaseReceipt.findFirst({
      where: { tenantId, id },
      include: WITH_RELATIONS,
    });
  }
}
