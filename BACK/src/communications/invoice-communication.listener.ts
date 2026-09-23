import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { CommunicationsService } from './communications.service';

// invoice.issued is already committed through the business Outbox. A failure
// here is retried by that Outbox; invoice idempotency prevents duplicate mail.
@Injectable()
export class InvoiceCommunicationListener {
  constructor(private readonly communications: CommunicationsService) {}

  @OnEvent('invoice.issued', { suppressErrors: false })
  async handle(event: {
    tenantId: string;
    invoiceId: string;
    issuedById?: string;
  }) {
    await this.communications.queueInvoice(
      event.tenantId,
      event.invoiceId,
      event.issuedById,
      true,
    );
  }
}
