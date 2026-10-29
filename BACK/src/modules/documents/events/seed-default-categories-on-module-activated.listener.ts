import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { DEFAULT_DOCUMENT_CATEGORIES } from '../constants/default-categories.constant';
import { DocumentCategoriesRepository } from '../repositories/document-categories.repository';
import type { DomainEvents } from '../../../common/events/domain-events';

type TenantModuleActivatedEvent = DomainEvents['tenant.module.activated'];

// Precarga categorías de ejemplo la primera vez que un tenant activa el
// módulo Documentos. Best-effort: nunca debe romper la activación del módulo.
@Injectable()
export class SeedDefaultCategoriesOnModuleActivatedListener {
  private readonly logger = new Logger(
    SeedDefaultCategoriesOnModuleActivatedListener.name,
  );

  constructor(
    private readonly categoriesRepository: DocumentCategoriesRepository,
  ) {}

  @OnDomainEvent('tenant.module.activated')
  async handle(event: TenantModuleActivatedEvent) {
    if (event.moduleName !== 'documents') return;

    try {
      const existing = await this.categoriesRepository.findAll(event.tenantId);
      if (existing.length > 0) return;

      for (const name of DEFAULT_DOCUMENT_CATEGORIES) {
        await this.categoriesRepository.create(event.tenantId, name);
      }
    } catch (error) {
      this.logger.error(
        `No se pudieron sembrar las categorías default para el tenant ${event.tenantId}: ${(error as Error).message}`,
      );
    }
  }
}
