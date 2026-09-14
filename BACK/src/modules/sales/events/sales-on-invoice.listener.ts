import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';

interface InvoiceIssuedEvent {
  tenantId: string;
  invoiceId: string;
  saleOrderId: string;
}

@Injectable()
export class SalesOnInvoiceListener {
  constructor(private readonly prisma: PrismaService) {}

  @OnEvent('invoice.issued', { suppressErrors: false })
  async handle(event: InvoiceIssuedEvent) {
    if (!event.saleOrderId) return;
    // Move the sale order to INVOICED so the seller can see the billing state
    await this.prisma.saleOrder.updateMany({
      where: {
        id: event.saleOrderId,
        tenantId: event.tenantId,
        status: 'CONFIRMED',
      },
      data: { status: 'INVOICED' },
    });
  }
}
