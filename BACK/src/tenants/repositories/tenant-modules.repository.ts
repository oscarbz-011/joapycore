import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../prisma/types';
import {
  DEFAULT_ACTIVE_MODULES,
  DEFAULT_INACTIVE_MODULES,
} from '../../common/constants/modules.constant';

@Injectable()
export class TenantModulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  seedDefaults(tenantId: string, client: PrismaClientOrTx = this.prisma) {
    const rows = [
      ...DEFAULT_ACTIVE_MODULES.map((moduleName) => ({
        tenantId,
        moduleName,
        active: true,
      })),
      ...DEFAULT_INACTIVE_MODULES.map((moduleName) => ({
        tenantId,
        moduleName,
        active: false,
      })),
    ];
    return client.tenantModule.createMany({ data: rows });
  }

  findAllForTenant(tenantId: string) {
    return this.prisma.tenantModule.findMany({
      where: { tenantId },
      orderBy: { moduleName: 'asc' },
    });
  }

  findActiveModuleNames(tenantId: string) {
    return this.prisma.tenantModule
      .findMany({
        where: { tenantId, active: true },
        select: { moduleName: true },
      })
      .then((rows) => rows.map((row) => row.moduleName));
  }

  async setActive(tenantId: string, moduleName: string, active: boolean) {
    const result = await this.prisma.tenantModule.updateMany({
      where: { tenantId, moduleName },
      data: { active },
    });
    return result.count;
  }
}
