import { Injectable } from '@nestjs/common';
import { Industry } from '@prisma/client';
import { ACTIVE_MODULES_BY_INDUSTRY, ALL_TENANT_MODULES } from '../../common/constants/modules.constant';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../prisma/types';

@Injectable()
export class TenantModulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  seedDefaults(tenantId: string, industry: Industry, client: PrismaClientOrTx = this.prisma) {
    const activeModules = ACTIVE_MODULES_BY_INDUSTRY[industry] ?? [];
    const rows = ALL_TENANT_MODULES.map((moduleName) => ({
      tenantId,
      moduleName,
      active: activeModules.includes(moduleName),
    }));
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
