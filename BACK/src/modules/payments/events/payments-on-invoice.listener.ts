import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';
import { PaymentSourcesRepository } from '../repositories/payment-sources.repository';

interface InvoiceIssuedEvent {
  tenantId: string;
  invoiceId: string;
  saleOrderId: string;
}

@Injectable()
export class PaymentsOnInvoiceListener {
  constructor(
    private readonly paymentSources: PaymentSourcesRepository,
    private readonly arRepository: AccountsReceivableRepository,
  ) {}

  @OnEvent('invoice.cancelled')
  async handleCancelled(event: { tenantId: string; invoiceId: string }) {
    const ar = await this.arRepository.findByInvoice(
      event.tenantId,
      event.invoiceId,
    );
    if (!ar || ar.status === 'CANCELLED') return;
    await this.arRepository.updateStatus(ar.id, 'CANCELLED');
  }

  @OnEvent('invoice.issued', { suppressErrors: false })
  async handle(event: InvoiceIssuedEvent) {
    // Idempotency: skip if an AR already exists for this invoice.
    // Prevents duplicate accounts receivable if the event fires more than once.
    const existing = await this.arRepository.findByInvoice(
      event.tenantId,
      event.invoiceId,
    );
    if (existing) return;

    const invoice = await this.paymentSources.findInvoiceForReceivable(
      event.tenantId,
      event.invoiceId,
    );
    if (!invoice) return;

    const arAmount =
      invoice.saleOrder?.saleType === 'CREDIT' && invoice.saleOrder.loan
        ? invoice.saleOrder.loan.totalAmount
        : invoice.total;

    await this.arRepository.create({
      tenantId: event.tenantId,
      invoiceId: event.invoiceId,
      amount: arAmount,
      dueDate: invoice.dueDate ?? undefined,
    });
  }
}
