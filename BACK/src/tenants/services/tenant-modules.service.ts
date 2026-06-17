import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ALL_TENANT_MODULES } from '../../common/constants/modules.constant';
import { TenantModulesRepository } from '../repositories/tenant-modules.repository';

@Injectable()
export class TenantModulesService {
  constructor(
    private readonly tenantModulesRepository: TenantModulesRepository,
  ) {}

  list(tenantId: string) {
    return this.tenantModulesRepository.findAllForTenant(tenantId);
  }

  async setActive(tenantId: string, moduleName: string, active: boolean) {
    if (!ALL_TENANT_MODULES.includes(moduleName)) {
      throw new BadRequestException(`Unknown module "${moduleName}"`);
    }
    const count = await this.tenantModulesRepository.setActive(
      tenantId,
      moduleName,
      active,
    );
    if (count === 0) {
      throw new NotFoundException(
        `Module "${moduleName}" is not configured for this tenant`,
      );
    }
    return this.tenantModulesRepository.findAllForTenant(tenantId);
  }
}
