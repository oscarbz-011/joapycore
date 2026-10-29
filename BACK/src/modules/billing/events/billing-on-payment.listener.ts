import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { InvoicesRepository } from '../repositories/invoices.repository';
import type { DomainEvents } from '../../../common/events/domain-events';

type PaymentArCompletedEvent = DomainEvents['payment.ar.completed'];

@Injectable()
export class BillingOnPaymentListener {
  constructor(private readonly invoicesRepository: InvoicesRepository) {}

  @OnDomainEvent('payment.ar.completed')
  async handle(event: PaymentArCompletedEvent) {
    const { tenantId, invoiceId } = event;
    await this.invoicesRepository.updateStatus(tenantId, invoiceId, 'PAID');
  }
}
