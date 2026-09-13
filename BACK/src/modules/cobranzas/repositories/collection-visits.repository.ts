import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CollectionVisitsRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      customer: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          address: true,
        },
      },
      installment: {
        select: {
          id: true,
          number: true,
          dueDate: true,
          amount: true,
          status: true,
        },
      },
      loan: {
        select: { id: true, totalAmount: true, totalInstallments: true },
      },
    };
  }

  findByRoute(tenantId: string, routeId: string) {
    return this.prisma.collectionVisit.findMany({
      where: { tenantId, routeId },
      include: this.include,
      orderBy: { visitOrder: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.collectionVisit.findFirst({
      where: { id, tenantId },
      include: this.include,
    });
  }

  create(data: Prisma.CollectionVisitUncheckedCreateInput) {
    return this.prisma.collectionVisit.create({ data, include: this.include });
  }

  update(id: string, data: Prisma.CollectionVisitUncheckedUpdateInput) {
    return this.prisma.collectionVisit.update({
      where: { id },
      data,
      include: this.include,
    });
  }

  delete(id: string) {
    return this.prisma.collectionVisit.delete({ where: { id } });
  }
}
