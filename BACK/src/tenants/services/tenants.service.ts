import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TenantsRepository } from '../repositories/tenants.repository';
import { UpdateTenantDto } from '../dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private readonly tenantsRepository: TenantsRepository) {}

  async getById(tenantId: string) {
    const tenant = await this.tenantsRepository.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async update(tenantId: string, dto: UpdateTenantDto) {
    await this.getById(tenantId);
    const { actividadesEconomicas, ...rest } = dto;
    const data: Prisma.TenantUpdateInput = {
      ...rest,
      ...(actividadesEconomicas !== undefined
        ? { actividadesEconomicas: actividadesEconomicas as unknown as Prisma.InputJsonValue }
        : {}),
    };
    return this.tenantsRepository.update(tenantId, data);
  }
}
