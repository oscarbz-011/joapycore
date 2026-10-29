import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { SaleOrdersService } from '../services/sale-orders.service';
import type { DomainEvents } from '../../../common/events/domain-events';

export type DeliveryNoteDeliveredEvent =
  DomainEvents['delivery.note.delivered'];

@Injectable()
export class SalesOnDeliveryListener {
  constructor(private readonly saleOrdersService: SaleOrdersService) {}

  // Llega por el outbox: si falla, el error vuelve para que se reintente.
  @OnDomainEvent('delivery.note.delivered', {
    consumer: 'sales.deliver-order',
    suppressErrors: false,
  })
  async handle(event: DeliveryNoteDeliveredEvent) {
    await this.saleOrdersService.handleDeliveryConfirmed(
      event.tenantId,
      event.saleOrderId,
      event.userId,
    );
  }
}
