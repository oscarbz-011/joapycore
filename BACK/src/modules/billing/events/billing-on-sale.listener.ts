import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { InvoicesRepository } from '../repositories/invoices.repository';

interface SaleOrderCompletedEvent {
  tenantId: string;
  saleOrderId: string;
  order: {
    items: Array<{
      id: string;
      productId: string;
      quantity: number;
      unitPrice: number | { toNumber(): number };
      product: { name: string };
    }>;
  };
}

@Injectable()
export class BillingOnSaleListener {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  @OnEvent('sale.order.completed')
  async handle(event: SaleOrderCompletedEvent) {
    const { tenantId, saleOrderId, order } = event;

    const total = order.items.reduce((sum, item) => {
      const price =
        typeof item.unitPrice === 'object'
          ? item.unitPrice.toNumber()
          : item.unitPrice;
      return sum + price * item.quantity;
    }, 0);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await this.invoicesRepository.create(
        {
          tenantId,
          saleOrderId,
          status: 'ISSUED',
          issuedAt: new Date(),
          total,
        },
        tx,
      );

      for (const item of order.items) {
        const unitPrice =
          typeof item.unitPrice === 'object'
            ? item.unitPrice.toNumber()
            : item.unitPrice;
        await this.invoicesRepository.createItem(
          {
            invoiceId: inv.id,
            description: item.product.name,
            quantity: item.quantity,
            unitPrice,
            total: unitPrice * item.quantity,
          },
          tx,
        );
      }

      return inv;
    });

    this.eventEmitter.emit('invoice.issued', { tenantId, invoiceId: invoice.id, saleOrderId });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'billing',
      action: 'invoice.issued',
      resourceId: invoice.id,
    });
  }
}
