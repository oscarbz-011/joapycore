import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CollectionNotesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByCustomer(tenantId: string, customerId: string) {
    return this.prisma.collectionNote.findMany({
      where: { tenantId, customerId },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: Prisma.CollectionNoteUncheckedCreateInput) {
    return this.prisma.collectionNote.create({
      data,
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }
}
