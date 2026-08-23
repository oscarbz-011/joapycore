import { Injectable } from '@nestjs/common';
import {
  ALL_TENANT_MODULES,
  MODULE_TEMPLATES,
} from '../../common/constants/modules.constant';
import { PrismaService } from '../../prisma/prisma.service';
import { PrismaClientOrTx } from '../../prisma/types';

@Injectable()
export class TenantModulesRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Registra TODOS los módulos del catálogo para el tenant.
   * Los módulos incluidos en el template del rubro se activan;
   * el resto queda inactivo. El tenant puede activarlos después.
   */
  seedDefaults(
    tenantId: string,
    industry: string | null | undefined,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const template =
      (industry ? MODULE_TEMPLATES[industry] : null) ??
      MODULE_TEMPLATES['default'];
    const rows = ALL_TENANT_MODULES.map((moduleName) => {
      const active = template.includes(moduleName);
      return {
        tenantId,
        moduleName,
        active,
        activatedAt: active ? new Date() : null,
      };
    });
    return client.tenantModule.createMany({ data: rows, skipDuplicates: true });
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
      data: {
        active,
        activatedAt: active ? new Date() : null,
      },
    });
    return result.count;
  }

  /**
   * Inserta filas para módulos del catálogo que aún no existen para el tenant.
   * Útil al agregar nuevos módulos al catálogo en tenants ya existentes.
   */
  async backfillMissing(
    tenantId: string,
    client: PrismaClientOrTx = this.prisma,
  ) {
    const existing = await this.prisma.tenantModule.findMany({
      where: { tenantId },
      select: { moduleName: true },
    });
    const existingNames = new Set(existing.map((m) => m.moduleName));
    const missing = ALL_TENANT_MODULES.filter(
      (name) => !existingNames.has(name),
    );
    if (missing.length === 0) return;
    await client.tenantModule.createMany({
      data: missing.map((moduleName) => ({
        tenantId,
        moduleName,
        active: false,
      })),
      skipDuplicates: true,
    });
  }
}
