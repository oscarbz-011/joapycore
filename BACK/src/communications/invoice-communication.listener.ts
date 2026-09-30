import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CommunicationsService } from './communications.service';

// invoice.issued is already committed through the business Outbox. Transient
// failures still retry there; deterministic email preparation failures do not
// replay other listeners of this shared business event.
@Injectable()
export class InvoiceCommunicationListener {
  constructor(private readonly communications: CommunicationsService) {}

  @OnEvent('invoice.issued', { suppressErrors: false })
  async handle(event: {
    tenantId: string;
    invoiceId: string;
    issuedById?: string;
  }) {
    await this.communications.queueInvoiceAutomatically(
      event.tenantId,
      event.invoiceId,
      event.issuedById,
    );
  }
}
