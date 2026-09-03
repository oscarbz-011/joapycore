import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

export interface UpsertBatchInput {
  batchNumber: string;
  unitCost: number;
  quantity: number;
  expiresAt?: Date;
}

@Injectable()
export class ProductBatchesRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Acumula cantidad en el mismo lote si ya existía (dos recepciones
  // parciales del mismo número de lote) — nunca falla por el unique
  // constraint (tenantId, productId, batchNumber).
  upsertBatch(
    tenantId: string,
    productId: string,
    data: UpsertBatchInput,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productBatch.upsert({
      where: {
        tenantId_productId_batchNumber: {
          tenantId,
          productId,
          batchNumber: data.batchNumber,
        },
      },
      create: {
        tenantId,
        productId,
        batchNumber: data.batchNumber,
        entryDate: new Date(),
        unitCost: data.unitCost,
        quantity: data.quantity,
        remainingQty: data.quantity,
        expiresAt: data.expiresAt,
      },
      update: {
        quantity: { increment: data.quantity },
        remainingQty: { increment: data.quantity },
      },
    });
  }

  // Lotes con stock disponible, más antiguo primero (FIFO), sin vencer.
  findAvailableFifo(
    tenantId: string,
    productId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productBatch.findMany({
      where: {
        tenantId,
        productId,
        remainingQty: { gt: 0 },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      orderBy: { entryDate: 'asc' },
    });
  }

  decrementRemaining(
    id: string,
    qty: number,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.productBatch.update({
      where: { id },
      data: { remainingQty: { decrement: qty } },
    });
  }

  findByProduct(tenantId: string, productId: string) {
    return this.prisma.productBatch.findMany({
      where: { tenantId, productId },
      orderBy: { entryDate: 'desc' },
    });
  }

  findAll(tenantId: string, filters: { productId?: string } = {}) {
    return this.prisma.productBatch.findMany({
      where: {
        tenantId,
        ...(filters.productId && { productId: filters.productId }),
      },
      include: { product: { select: { id: true, name: true, model: true } } },
      orderBy: { entryDate: 'desc' },
    });
  }
}
