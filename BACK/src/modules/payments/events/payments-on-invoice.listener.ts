import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';
import { PaymentSourcesRepository } from '../repositories/payment-sources.repository';
import type { DomainEvents } from '../../../common/events/domain-events';

type InvoiceIssuedEvent = DomainEvents['invoice.issued'];

@Injectable()
export class PaymentsOnInvoiceListener {
  constructor(
    private readonly paymentSources: PaymentSourcesRepository,
    private readonly arRepository: AccountsReceivableRepository,
  ) {}

  @OnDomainEvent('invoice.cancelled')
  async handleCancelled(event: { tenantId: string; invoiceId: string }) {
    const ar = await this.arRepository.findByInvoice(
      event.tenantId,
      event.invoiceId,
    );
    if (!ar || ar.status === 'CANCELLED') return;
    await this.arRepository.updateStatus(ar.id, 'CANCELLED');
  }

  @OnDomainEvent('invoice.issued', { suppressErrors: false })
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
    // Cobrada antes de emitirse (venta de caja): no queda nada por cobrar.
    if (!invoice || invoice.status === 'PAID') return;

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
