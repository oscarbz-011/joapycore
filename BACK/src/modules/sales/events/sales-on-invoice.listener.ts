import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { SaleOrdersRepository } from '../repositories/sale-orders.repository';
import type { DomainEvents } from '../../../common/events/domain-events';

type InvoiceIssuedEvent = DomainEvents['invoice.issued'];

@Injectable()
export class SalesOnInvoiceListener {
  constructor(private readonly saleOrdersRepository: SaleOrdersRepository) {}

  @OnDomainEvent('invoice.issued', {
    consumer: 'sales.mark-invoiced',
    suppressErrors: false,
  })
  async handle(event: InvoiceIssuedEvent) {
    if (!event.saleOrderId) return;
    // Move the sale order to INVOICED so the seller can see the billing state
    await this.saleOrdersRepository.markInvoiced(
      event.tenantId,
      event.saleOrderId,
    );
  }
}
