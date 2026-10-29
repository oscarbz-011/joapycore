import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';
import { PaymentSourcesRepository } from '../repositories/payment-sources.repository';
import type { DomainEvents } from '../../../common/events/domain-events';

type InstallmentPaidEvent = DomainEvents['installment.paid'];

@Injectable()
export class PaymentsOnInstallmentListener {
  private readonly logger = new Logger(PaymentsOnInstallmentListener.name);

  constructor(
    private readonly paymentSources: PaymentSourcesRepository,
    private readonly arRepository: AccountsReceivableRepository,
    private readonly eventEmitter: EventBus,
  ) {}

  @OnDomainEvent('installment.paid')
  async handle(event: InstallmentPaidEvent) {
    try {
      // Find invoice for this sale order
      const invoice = await this.paymentSources.findInvoiceIdBySaleOrder(
        event.tenantId,
        event.saleOrderId,
      );
      if (!invoice) return;

      // Find AR for this invoice
      const ar = await this.arRepository.findByInvoice(
        event.tenantId,
        invoice.id,
      );
      if (!ar || ar.status === 'PAID' || ar.status === 'CANCELLED') return;

      // Atomic increment of paid amount
      await this.arRepository.incrementPaid(ar.id, event.amount);

      // Refresh to check new totals
      const updated = await this.arRepository.findAmounts(
        event.tenantId,
        ar.id,
      );
      if (!updated) return;

      const total =
        typeof updated.amount === 'object'
          ? (updated.amount as { toNumber(): number }).toNumber()
          : Number(updated.amount);
      const paid =
        typeof updated.paidAmount === 'object'
          ? (updated.paidAmount as { toNumber(): number }).toNumber()
          : Number(updated.paidAmount);

      if (paid >= total - 0.01) {
        await this.arRepository.updateStatus(ar.id, 'PAID');
        this.eventEmitter.emit('payment.ar.completed', {
          tenantId: event.tenantId,
          arId: ar.id,
          invoiceId: invoice.id,
        });
      } else {
        await this.arRepository.updateStatus(ar.id, 'PARTIAL');
      }
    } catch (err) {
      this.logger.error('Error processing installment.paid event', err);
    }
  }
}
