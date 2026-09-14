import { Injectable } from '@nestjs/common';
import { CollectionRouteStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class CollectionRoutesRepository {
  constructor(private readonly prisma: PrismaService) {}

  private get include() {
    return {
      collector: { select: { id: true, firstName: true, lastName: true } },
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      visits: {
        include: {
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
              paidAmount: true,
              status: true,
            },
          },
        },
        orderBy: { visitOrder: 'asc' as const },
      },
    };
  }

  findAll(
    tenantId: string,
    filters?: { collectorId?: string; status?: string; from?: Date; to?: Date },
  ) {
    const where: Prisma.CollectionRouteWhereInput = { tenantId };
    if (filters?.collectorId) where.collectorId = filters.collectorId;
    // Query param libre: un valor que no es del enum se ignora en vez de
    // hacer fallar la consulta.
    if (
      filters?.status &&
      (Object.values(CollectionRouteStatus) as string[]).includes(
        filters.status,
      )
    ) {
      where.status = filters.status as CollectionRouteStatus;
    }
    if (filters?.from || filters?.to) {
      where.routeDate = {
        ...(filters.from ? { gte: filters.from } : {}),
        ...(filters.to ? { lte: filters.to } : {}),
      };
    }
    return this.prisma.collectionRoute.findMany({
      where,
      include: this.include,
      orderBy: { routeDate: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.collectionRoute.findFirst({
      where: { id, tenantId },
      include: this.include,
    });
  }

  create(data: Prisma.CollectionRouteUncheckedCreateInput) {
    return this.prisma.collectionRoute.create({ data, include: this.include });
  }

  // Ajusta los totales acumulados (deltas positivos o negativos).
  adjustTotals(id: string, delta: { planned?: number; collected?: number }) {
    return this.prisma.collectionRoute.update({
      where: { id },
      data: {
        ...(delta.planned !== undefined && {
          totalPlanned: { increment: delta.planned },
        }),
        ...(delta.collected !== undefined && {
          totalCollected: { increment: delta.collected },
        }),
      },
    });
  }

  countOpen(tenantId: string) {
    return this.prisma.collectionRoute.count({
      where: { tenantId, status: 'OPEN' },
    });
  }

  // routeDate es un día calendario (@db.Date).
  countOnDate(tenantId: string, day: Date) {
    const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);
    return this.prisma.collectionRoute.count({
      where: { tenantId, routeDate: { gte: day, lt: next } },
    });
  }

  async sumCollectedOfClosed(tenantId: string) {
    const result = await this.prisma.collectionRoute.aggregate({
      where: { tenantId, status: 'CLOSED' },
      _sum: { totalCollected: true },
    });
    return result._sum.totalCollected;
  }

  update(id: string, data: Prisma.CollectionRouteUncheckedUpdateInput) {
    return this.prisma.collectionRoute.update({
      where: { id },
      data,
      include: this.include,
    });
  }
}
