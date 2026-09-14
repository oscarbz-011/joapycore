import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SaleOrdersRepository } from '../repositories/sale-orders.repository';

interface InvoiceIssuedEvent {
  tenantId: string;
  invoiceId: string;
  saleOrderId: string;
}

@Injectable()
export class SalesOnInvoiceListener {
  constructor(private readonly saleOrdersRepository: SaleOrdersRepository) {}

  @OnEvent('invoice.issued', { suppressErrors: false })
  async handle(event: InvoiceIssuedEvent) {
    if (!event.saleOrderId) return;
    // Move the sale order to INVOICED so the seller can see the billing state
    await this.saleOrdersRepository.markInvoiced(
      event.tenantId,
      event.saleOrderId,
    );
  }
}
