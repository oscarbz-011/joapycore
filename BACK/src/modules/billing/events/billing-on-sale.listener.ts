import { Injectable } from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import { InvoicesRepository } from '../repositories/invoices.repository';
import {
  effectiveUnitPrice,
  toInvoiceItem,
  toNum,
} from '../utils/invoice-items.util';
import type { DomainEvents } from '../../../common/events/domain-events';

type SaleOrderCompletedEvent = DomainEvents['sale.payment.collected'];

@Injectable()
export class BillingOnSaleListener {
  constructor(
    // Solo para abrir la transacción; los accesos a datos van por repositorios.
    private readonly prisma: PrismaService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly eventEmitter: EventBus,
    private readonly billingSources: BillingSourcesRepository,
  ) {}

  // Credit sales: invoice created when order is confirmed (CONFIRMED status)
  // suppressErrors: false — lo despacha el outbox, que reintenta si falla.
  @OnDomainEvent('sale.order.completed', {
    consumer: 'billing.invoice-from-order',
    suppressErrors: false,
  })
  // Cash sales: invoice created when payment is collected (PAYMENT_RECEIVED status)
  @OnDomainEvent('sale.payment.collected', {
    consumer: 'billing.invoice-from-payment',
    suppressErrors: false,
  })
  async handle(event: SaleOrderCompletedEvent) {
    const { tenantId, saleOrderId } = event;

    // Idempotency: skip if an invoice already exists for this order.
    // Prevents duplicate invoices if the event fires more than once.
    const existing = await this.invoicesRepository.findBySaleOrder(
      tenantId,
      saleOrderId,
    );
    if (existing) return;

    // Se lee el pedido de la base (no del payload): en un reintento del
    // outbox los datos tienen que ser los actuales.
    const order = await this.billingSources.findSaleOrderForInvoicing(
      tenantId,
      saleOrderId,
    );
    if (!order) return;

    // For credit sales, the invoice total is the full financed amount (principal + interest),
    // which lives in the Loan created when credit was approved. For cash sales, sum the items.
    let total: number;
    if (order.saleType === 'CREDIT') {
      const loan = await this.billingSources.findLoanTotalBySaleOrder(
        tenantId,
        saleOrderId,
      );
      total = loan
        ? toNum(loan.totalAmount)
        : order.items.reduce(
            (sum, item) => sum + effectiveUnitPrice(item) * item.quantity,
            0,
          );
    } else {
      total = order.items.reduce(
        (sum, item) => sum + effectiveUnitPrice(item) * item.quantity,
        0,
      );
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await this.invoicesRepository.create(
        { tenantId, saleOrderId, status: 'PENDING', total },
        tx,
      );

      for (const item of order.items) {
        await this.invoicesRepository.createItem(
          { invoiceId: inv.id, ...toInvoiceItem(item) },
          tx,
        );
      }

      return inv;
    });

    this.eventEmitter.emit('invoice.created', {
      tenantId,
      invoiceId: invoice.id,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'billing',
      action: 'invoice.created',
      resourceId: invoice.id,
    });
  }
}
