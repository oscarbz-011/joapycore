import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  ALL_TENANT_MODULES,
  MODULE_CATALOG,
} from '../../common/constants/modules.constant';
import { TenantModulesRepository } from '../repositories/tenant-modules.repository';
import { TenantModulesCache } from './tenant-modules.cache';

@Injectable()
export class TenantModulesService {
  constructor(
    private readonly tenantModulesRepository: TenantModulesRepository,
    private readonly tenantModulesCache: TenantModulesCache,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async list(tenantId: string) {
    await this.tenantModulesRepository.backfillMissing(tenantId);
    return this.tenantModulesRepository.findAllForTenant(tenantId);
  }

  async setActive(tenantId: string, moduleName: string, active: boolean) {
    if (!ALL_TENANT_MODULES.includes(moduleName)) {
      throw new BadRequestException(`Unknown module "${moduleName}"`);
    }

    const definition = MODULE_CATALOG[moduleName];
    if (definition.bundledWith) {
      const parent = MODULE_CATALOG[definition.bundledWith];
      throw new UnprocessableEntityException(
        `"${definition.displayName}" se activa y desactiva junto con "${parent.displayName}"`,
      );
    }

    // Los addons sin interruptor propio siguen a este módulo.
    const bundled = ALL_TENANT_MODULES.filter(
      (key) => MODULE_CATALOG[key].bundledWith === moduleName,
    );
    const affected = [moduleName, ...bundled];
    const displayName = (key: string) => {
      const parentKey = MODULE_CATALOG[key]?.bundledWith ?? key;
      return MODULE_CATALOG[parentKey]?.displayName ?? key;
    };

    const allModules =
      await this.tenantModulesRepository.findAllForTenant(tenantId);
    const activeMap = new Map(allModules.map((m) => [m.moduleName, m.active]));

    if (active) {
      const inactiveDeps = [
        ...new Set(
          affected.flatMap((key) =>
            MODULE_CATALOG[key].dependencies.filter(
              (dep) => !affected.includes(dep) && !activeMap.get(dep),
            ),
          ),
        ),
      ];
      if (inactiveDeps.length > 0) {
        const names = [...new Set(inactiveDeps.map(displayName))].join(', ');
        throw new UnprocessableEntityException(
          `Para activar "${definition.displayName}" primero debés activar: ${names}`,
        );
      }
    } else {
      const blockingModules = allModules.filter(
        (m) =>
          m.active &&
          !affected.includes(m.moduleName) &&
          MODULE_CATALOG[m.moduleName]?.dependencies.some((dep) =>
            affected.includes(dep),
          ),
      );
      if (blockingModules.length > 0) {
        const names = [
          ...new Set(blockingModules.map((m) => displayName(m.moduleName))),
        ].join(', ');
        throw new UnprocessableEntityException(
          `No podés desactivar "${definition.displayName}" porque dependen de él: ${names}`,
        );
      }
    }

    await this.tenantModulesRepository.backfillMissing(tenantId);
    for (const key of affected) {
      await this.tenantModulesRepository.setActive(tenantId, key, active);
    }
    // Sin esto el cambio tardaría hasta el TTL en verse; con esto el próximo
    // request ya lee el estado nuevo.
    this.tenantModulesCache.invalidate(tenantId);

    if (active) {
      for (const key of affected.filter((k) => !activeMap.get(k))) {
        this.eventEmitter.emit('tenant.module.activated', {
          tenantId,
          moduleName: key,
        });
      }
    }

    return this.tenantModulesRepository.findAllForTenant(tenantId);
  }
}
