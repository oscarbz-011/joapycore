import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { DeliveryNotesService } from '../services/delivery-notes.service';
import type { DomainEvents } from '../../../common/events/domain-events';

type TenantModuleActivatedEvent = DomainEvents['tenant.module.activated'];

/**
 * Mientras Logística estuvo apagada, Ventas entregó los pedidos por su cuenta
 * y no se crearon notas. Al activarla, las pendientes aparecen y las que ya
 * se entregaron no quedan abiertas.
 */
@Injectable()
export class LogisticsOnModuleActivatedListener {
  constructor(private readonly deliveryNotes: DeliveryNotesService) {}

  @OnDomainEvent('tenant.module.activated')
  async handle(event: TenantModuleActivatedEvent): Promise<void> {
    if (event.moduleName !== 'logistics') return;
    await this.deliveryNotes.syncWithSales(event.tenantId);
  }
}
