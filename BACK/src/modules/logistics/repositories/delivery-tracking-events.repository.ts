import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../../prisma/types';

@Injectable()
export class DeliveryTrackingEventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(
    tenantId: string,
    data: Omit<Prisma.DeliveryTrackingEventUncheckedCreateInput, 'tenantId'>,
    client: PrismaClientOrTx = this.prisma,
  ) {
    return client.deliveryTrackingEvent.create({
      data: { ...data, tenantId },
      include: {
        recordedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  findByDeliveryNote(tenantId: string, deliveryNoteId: string) {
    return this.prisma.deliveryTrackingEvent.findMany({
      where: { tenantId, deliveryNoteId },
      include: {
        recordedBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { recordedAt: 'asc' },
    });
  }
}
