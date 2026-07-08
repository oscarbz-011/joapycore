import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { AccountsReceivableRepository } from '../repositories/accounts-receivable.repository';

interface InvoiceIssuedEvent {
  tenantId: string;
  invoiceId: string;
  saleOrderId: string;
}

@Injectable()
export class PaymentsOnInvoiceListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly arRepository: AccountsReceivableRepository,
  ) {}

  @OnEvent('invoice.cancelled')
  async handleCancelled(event: { tenantId: string; invoiceId: string }) {
    const ar = await this.arRepository.findByInvoice(event.tenantId, event.invoiceId);
    if (!ar || ar.status === 'CANCELLED') return;
    await this.arRepository.updateStatus(ar.id, 'CANCELLED');
  }

  @OnEvent('invoice.issued')
  async handle(event: InvoiceIssuedEvent) {
    // Idempotency: skip if an AR already exists for this invoice.
    // Prevents duplicate accounts receivable if the event fires more than once.
    const existing = await this.arRepository.findByInvoice(event.tenantId, event.invoiceId);
    if (existing) return;

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: event.invoiceId },
      select: { total: true, dueDate: true },
    });
    if (!invoice) return;

    await this.arRepository.create({
      tenantId: event.tenantId,
      invoiceId: event.invoiceId,
      amount: invoice.total,
      dueDate: invoice.dueDate ?? undefined,
    });
  }
}
