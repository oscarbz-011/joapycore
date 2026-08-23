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

@Injectable()
export class TenantModulesService {
  constructor(
    private readonly tenantModulesRepository: TenantModulesRepository,
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
    const allModules =
      await this.tenantModulesRepository.findAllForTenant(tenantId);
    const activeMap = new Map(allModules.map((m) => [m.moduleName, m.active]));

    if (active) {
      // Verificar que todas las dependencias estén activas
      const inactiveDeps = definition.dependencies.filter(
        (dep) => !activeMap.get(dep),
      );
      if (inactiveDeps.length > 0) {
        const names = inactiveDeps
          .map((d) => MODULE_CATALOG[d]?.displayName ?? d)
          .join(', ');
        throw new UnprocessableEntityException(
          `Para activar "${definition.displayName}" primero debés activar: ${names}`,
        );
      }
    } else {
      // Verificar que ningún módulo activo dependa de éste
      const blockingModules = allModules.filter(
        (m) =>
          m.active &&
          m.moduleName !== moduleName &&
          MODULE_CATALOG[m.moduleName]?.dependencies.includes(moduleName),
      );
      if (blockingModules.length > 0) {
        const names = blockingModules
          .map((m) => MODULE_CATALOG[m.moduleName]?.displayName ?? m.moduleName)
          .join(', ');
        throw new UnprocessableEntityException(
          `No podés desactivar "${definition.displayName}" porque dependen de él: ${names}`,
        );
      }
    }

    const wasActive = activeMap.get(moduleName) ?? false;

    await this.tenantModulesRepository.backfillMissing(tenantId);
    await this.tenantModulesRepository.setActive(tenantId, moduleName, active);

    if (active && !wasActive) {
      this.eventEmitter.emit('tenant.module.activated', {
        tenantId,
        moduleName,
      });
    }

    return this.tenantModulesRepository.findAllForTenant(tenantId);
  }
}
