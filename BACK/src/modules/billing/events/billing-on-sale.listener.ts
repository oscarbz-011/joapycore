import { Injectable, Logger } from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { PrismaService } from '../../../prisma/prisma.service';
import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import { InvoicesRepository } from '../repositories/invoices.repository';
import { money, sumMoney } from '../../../common/money/money';
import { saleAmounts } from '../../../common/money/sale-amounts';
import {
  surchargeInvoiceItem,
  toInvoiceItem,
} from '../utils/invoice-items.util';
import type { DomainEvents } from '../../../common/events/domain-events';

type SaleOrderCompletedEvent = DomainEvents['sale.payment.collected'];

@Injectable()
export class BillingOnSaleListener {
  private readonly logger = new Logger(BillingOnSaleListener.name);

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

    // Las líneas, el recargo y el total salen de la misma fórmula que el
    // préstamo: a crédito, la suma de las cuotas es el total facturado.
    const { surcharge } = saleAmounts({
      lines: order.items,
      surcharge: { type: order.surchargeType, amount: order.surchargeAmount },
      interestRate: order.saleType === 'CREDIT' ? order.interestRate : null,
    });
    const items = order.items.map(toInvoiceItem);
    if (!surcharge.isZero()) items.push(surchargeInvoiceItem(surcharge));
    const total = sumMoney(items.map((item) => item.total));

    if (order.saleType === 'CREDIT') {
      const loan = await this.billingSources.findLoanTotalBySaleOrder(
        tenantId,
        saleOrderId,
      );
      if (loan && !money(loan.totalAmount).equals(total)) {
        this.logger.warn(
          `La factura del pedido ${saleOrderId} (${total.toString()}) no coincide con su crédito (${money(loan.totalAmount).toString()}): el crédito es anterior a los montos exactos`,
        );
      }
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      const inv = await this.invoicesRepository.create(
        { tenantId, saleOrderId, status: 'PENDING', total },
        tx,
      );

      for (const item of items) {
        await this.invoicesRepository.createItem(
          { tenantId, invoiceId: inv.id, ...item },
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
