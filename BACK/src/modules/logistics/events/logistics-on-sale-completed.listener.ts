import { Injectable } from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { DeliveryNotesRepository } from '../repositories/delivery-notes.repository';
import {
  AWAITING_DELIVERY,
  LogisticsSourcesRepository,
} from '../repositories/logistics-sources.repository';
import type { DomainEvents } from '../../../common/events/domain-events';

type SaleOrderEvent = DomainEvents['sale.payment.collected'];

/**
 * Crea la nota de entrega PENDING cuando un pedido queda listo para entregar:
 * al confirmarlo, o al cobrar una venta de contado, que no pasa por
 * "confirmar". Antes la creaba Ventas escribiendo directo en delivery_notes.
 */
@Injectable()
export class LogisticsOnSaleCompletedListener {
  constructor(
    private readonly deliveryNotesRepository: DeliveryNotesRepository,
    private readonly eventEmitter: EventBus,
    private readonly sources: LogisticsSourcesRepository,
  ) {}

  @OnDomainEvent('sale.order.completed', {
    consumer: 'logistics.note-from-order',
    module: 'logistics',
    suppressErrors: false,
  })
  async handle(event: SaleOrderEvent): Promise<void> {
    await this.ensureNote(event);
  }

  @OnDomainEvent('sale.payment.collected', {
    consumer: 'logistics.note-from-payment',
    module: 'logistics',
    suppressErrors: false,
  })
  async handlePaymentCollected(event: SaleOrderEvent): Promise<void> {
    // Las ventas del POS se cobran ya entregadas.
    const status = await this.sources.findOrderStatus(
      event.tenantId,
      event.saleOrderId,
    );
    if (!status || !AWAITING_DELIVERY.includes(status)) return;
    await this.ensureNote(event);
  }

  // Sin Logística (module) el outbox no lo llama: la entrega la registra
  // Ventas y, si se activa después, el listener de activación crea las notas.
  private async ensureNote(event: SaleOrderEvent) {
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
