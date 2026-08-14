import { Injectable } from '@nestjs/common';
import { DeliveryNoteStatus } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

const include = {
  saleOrder: {
    include: {
      customer: true,
      items: {
        include: { product: { select: { id: true, name: true, isSerialized: true } } },
      },
    },
  },
} as const;

@Injectable()
export class DeliveryNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string, status?: DeliveryNoteStatus) {
    return this.prisma.deliveryNote.findMany({
      where: { tenantId, ...(status ? { status } : {}) },
      include,
      orderBy: { createdAt: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.deliveryNote.findFirst({
      where: { id, tenantId },
      include,
    });
  }

  update(
    tenantId: string,
    id: string,
    data: {
      status: DeliveryNoteStatus;
      carrier?: string;
      vehicle?: string;
      notes?: string;
      deliveredAt?: Date;
    },
  ) {
    return this.prisma.deliveryNote.updateMany({
      where: { id, tenantId },
      data,
    });
  }
}
