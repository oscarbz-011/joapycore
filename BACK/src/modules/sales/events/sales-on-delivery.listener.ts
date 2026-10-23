import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SaleOrdersService } from '../services/sale-orders.service';

export interface DeliveryNoteDeliveredEvent {
  tenantId: string;
  saleOrderId: string;
  deliveryNoteId: string;
  userId?: string;
}

@Injectable()
export class SalesOnDeliveryListener {
  constructor(private readonly saleOrdersService: SaleOrdersService) {}

  // Llega por el outbox: si falla, el error vuelve para que se reintente.
  @OnEvent('delivery.note.delivered', { suppressErrors: false })
  async handle(event: DeliveryNoteDeliveredEvent) {
    await this.saleOrdersService.handleDeliveryConfirmed(
      event.tenantId,
      event.saleOrderId,
      event.userId,
    );
  }
}
