import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { DeliveryNotesService } from '../services/delivery-notes.service';

interface TenantModuleActivatedEvent {
  tenantId: string;
  moduleName: string;
}

/**
 * Mientras Logística estuvo apagada, Ventas entregó los pedidos por su cuenta
 * y no se crearon notas. Al activarla, las pendientes aparecen y las que ya
 * se entregaron no quedan abiertas.
 */
@Injectable()
export class LogisticsOnModuleActivatedListener {
  constructor(private readonly deliveryNotes: DeliveryNotesService) {}

  @OnEvent('tenant.module.activated')
  async handle(event: TenantModuleActivatedEvent): Promise<void> {
    if (event.moduleName !== 'logistics') return;
    await this.deliveryNotes.syncAfterActivation(event.tenantId);
  }
}
