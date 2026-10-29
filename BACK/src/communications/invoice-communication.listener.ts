import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../common/events/on-domain-event.decorator';
import type { DomainEvents } from '../common/events/domain-events';
import { CommunicationsService } from './communications.service';

// invoice.issued is already committed through the business Outbox. Transient
// failures still retry there; deterministic email preparation failures do not
// replay other listeners of this shared business event.
@Injectable()
export class InvoiceCommunicationListener {
  constructor(private readonly communications: CommunicationsService) {}

  @OnDomainEvent('invoice.issued', {
    consumer: 'communications.send-invoice',
    suppressErrors: false,
  })
  async handle(event: DomainEvents['invoice.issued']) {
    await this.communications.queueInvoiceAutomatically(
      event.tenantId,
      event.invoiceId,
      event.issuedById ?? undefined,
    );
  }
}
