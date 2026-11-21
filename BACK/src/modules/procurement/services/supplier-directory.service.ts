import { Injectable } from '@nestjs/common';
import type { SupplierDirectory } from '../../../common/contracts/supplier-directory.contract';
import { TenantModulesCache } from '../../../tenants/services/tenant-modules.cache';
import { procurementManifest } from '../module.manifest';
import { SuppliersRepository } from '../repositories/suppliers.repository';

@Injectable()
export class SupplierDirectoryService implements SupplierDirectory {
  constructor(
    private readonly suppliers: SuppliersRepository,
    private readonly modules: TenantModulesCache,
  ) {}

  async findActive(tenantId: string, supplierId: string) {
    if (!(await this.modules.isActive(tenantId, procurementManifest.key))) {
      return null;
    }
    const supplier = await this.suppliers.findById(tenantId, supplierId);
    return supplier?.isActive ? { id: supplier.id } : null;
  }
}
