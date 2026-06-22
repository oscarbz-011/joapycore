import { Injectable } from '@nestjs/common';
import { AlertType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class AlertsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(tenantId: string) {
    return this.prisma.alertConfig.findMany({
      where: { tenantId },
      orderBy: { type: 'asc' },
    });
  }

  findByType(tenantId: string, type: AlertType) {
    return this.prisma.alertConfig.findUnique({
      where: { tenantId_type: { tenantId, type } },
    });
  }

  upsert(tenantId: string, data: Prisma.AlertConfigUncheckedCreateInput) {
    return this.prisma.alertConfig.upsert({
      where: { tenantId_type: { tenantId, type: data.type } },
      create: { ...data, tenantId },
      update: {
        channel:   data.channel,
        isActive:  data.isActive,
        threshold: data.threshold,
      },
    });
  }
}
