import { Injectable } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import { InvoicesRepository } from '../repositories/invoices.repository';

interface SaleOrderCompletedEvent {
  tenantId: string;
  saleOrderId: string;
}

function toNum(value: number | { toNumber(): number }): number {
  return typeof value === 'object' ? value.toNumber() : value;
}

// Precio con interés ya aplicado cuando existe (ventas a crédito) — cae al
// precio contado para ventas al contado o ítems de ventas a crédito creados
// antes de que este campo existiera.
function effectiveUnitPrice(item: {
  unitPrice: number | { toNumber(): number };
  financedUnitPrice?: number | { toNumber(): number } | null;
}): number {
  return item.financedUnitPrice != null
    ? toNum(item.financedUnitPrice)
    : toNum(item.unitPrice);
}

@Injectable()
export class BillingOnSaleListener {
  constructor(
    // Solo para abrir la transacción; los accesos a datos van por repositorios.
    private readonly prisma: PrismaService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly billingSources: BillingSourcesRepository,
  ) {}

  // Credit sales: invoice created when order is confirmed (CONFIRMED status)
  // suppressErrors: false — lo despacha el outbox, que reintenta si falla.
  @OnEvent('sale.order.completed', { suppressErrors: false })
  // Cash sales: invoice created when payment is collected (PAYMENT_RECEIVED status)
  @OnEvent('sale.payment.collected', { suppressErrors: false })
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
        const unitPrice = effectiveUnitPrice(item);
        await this.invoicesRepository.createItem(
          {
            invoiceId: inv.id,
            description: item.product?.name ?? item.description ?? 'Ítem',
            quantity: item.quantity,
            unitPrice,
            total: unitPrice * item.quantity,
          },
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
