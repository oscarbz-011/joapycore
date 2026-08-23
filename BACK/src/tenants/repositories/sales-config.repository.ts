import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SalesConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenant(tenantId: string) {
    return this.prisma.salesConfig.findUnique({ where: { tenantId } });
  }

  upsertConfig(tenantId: string, combosEnabled: boolean) {
    return this.prisma.salesConfig.upsert({
      where: { tenantId },
      create: { tenantId, combosEnabled },
      update: { combosEnabled },
    });
  }
}
