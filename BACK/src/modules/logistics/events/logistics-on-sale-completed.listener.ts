import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { DeliveryNotesRepository } from '../repositories/delivery-notes.repository';

interface SaleOrderCompletedEvent {
  tenantId: string;
  saleOrderId: string;
}

/**
 * Crea la nota de entrega PENDING cuando se confirma un pedido. Antes la
 * creaba Ventas escribiendo directo en delivery_notes.
 */
@Injectable()
export class LogisticsOnSaleCompletedListener {
  constructor(
    private readonly deliveryNotesRepository: DeliveryNotesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('sale.order.completed')
  async handle(event: SaleOrderCompletedEvent): Promise<void> {
    const note = await this.deliveryNotesRepository.ensurePendingForOrder(
      event.tenantId,
      event.saleOrderId,
    );
    // Solo la primera confirmación crea la nota: re-confirmar un pedido cuya
    // nota ya avanzó no debe reabrir el badge de "pendiente de despacho".
    if (note.created) {
      this.eventEmitter.emit('delivery.note.created', {
        tenantId: event.tenantId,
        saleOrderId: event.saleOrderId,
        deliveryNoteId: note.id,
      });
    }
  }
}
