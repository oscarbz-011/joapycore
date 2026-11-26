import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface SalesConfigChanges {
  combosEnabled?: boolean;
  presentationsEnabled?: boolean | null;
}

@Injectable()
export class SalesConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByTenant(tenantId: string) {
    return this.prisma.salesConfig.findUnique({ where: { tenantId } });
  }

  upsertConfig(tenantId: string, changes: SalesConfigChanges) {
    return this.prisma.salesConfig.upsert({
      where: { tenantId },
      create: { tenantId, ...changes },
      update: changes,
    });
  }
}
