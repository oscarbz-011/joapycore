import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { CategoriesRepository } from '../repositories/categories.repository';
import type { DomainEvents } from '../../../common/events/domain-events';

type TenantRegisteredEvent = DomainEvents['tenant.registered'];

@Injectable()
export class InventoryOnTenantListener {
  constructor(private readonly categoriesRepository: CategoriesRepository) {}

  @OnDomainEvent('tenant.registered')
  async handle(event: TenantRegisteredEvent) {
    await this.categoriesRepository.seedDefaults(
      event.tenantId,
      event.industry,
    );
  }
}
