import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InvoicesRepository } from '../repositories/invoices.repository';

interface PaymentArCompletedEvent {
  tenantId: string;
  arId: string;
  invoiceId: string;
}

@Injectable()
export class BillingOnPaymentListener {
  constructor(private readonly invoicesRepository: InvoicesRepository) {}

  @OnEvent('payment.ar.completed')
  async handle(event: PaymentArCompletedEvent) {
    const { tenantId, invoiceId } = event;
    await this.invoicesRepository.updateStatus(tenantId, invoiceId, 'PAID');
  }
}
