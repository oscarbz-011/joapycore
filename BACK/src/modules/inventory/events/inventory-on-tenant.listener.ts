import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { Industry } from '@prisma/client';
import { CategoriesRepository } from '../repositories/categories.repository';

interface TenantRegisteredEvent {
  tenantId: string;
  industry: Industry;
}

@Injectable()
export class InventoryOnTenantListener {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  @OnEvent('tenant.registered')
  async handle(event: TenantRegisteredEvent) {
    await this.categoriesRepository.seedDefaults(
      event.tenantId,
      event.industry,
    );
  }
}
