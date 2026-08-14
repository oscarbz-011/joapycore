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

  @OnEvent('delivery.note.delivered')
  async handle(event: DeliveryNoteDeliveredEvent) {
    await this.saleOrdersService.handleDeliveryConfirmed(
      event.tenantId,
      event.saleOrderId,
      event.userId,
    );
  }
}
