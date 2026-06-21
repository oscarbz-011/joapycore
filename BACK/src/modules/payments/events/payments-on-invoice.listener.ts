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

  @OnEvent('invoice.issued')
  async handle(event: InvoiceIssuedEvent) {
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
