import { money, roundGuaranies, type Money } from '../../../common/money/money';
import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import { InvoicesService } from '../services/invoices.service';
import type { DomainEvents } from '../../../common/events/domain-events';

type PaymentReceiptCreatedEvent = DomainEvents['payment.receipt.created'];

const IVA_RATE = 10;

function ivaBreakdown(total: Money): {
  ivaAmount: Money;
  unitPriceWithoutIva: Money;
} {
  // IVA incluido en el monto cobrado (criterio general de retail en
  // Paraguay) — mismo desglose que se mostraría en una factura de venta
  // normal si esa lógica estuviera implementada (hoy no lo está en ningún
  // lado del código: InvoiceItem.ivaRate siempre es null en la práctica).
  const ivaAmount = roundGuaranies(total.mul(IVA_RATE).div(100 + IVA_RATE));
  return { ivaAmount, unitPriceWithoutIva: total.minus(ivaAmount) };
}

// Cuando un cobro de cuota incluye cargos de interés/mora, además del recibo
// de siempre (ver receipt-on-payment.listener.ts) se emite una Factura
// aparte solo por esos intereses — pedido explícito del usuario, ya que el
// recibo no es un documento fiscal. Best-effort: nunca debe bloquear el
// cobro si algo falla acá.
@Injectable()
export class InterestInvoiceOnReceiptListener {
  private readonly logger = new Logger(InterestInvoiceOnReceiptListener.name);

  constructor(
    private readonly billingSources: BillingSourcesRepository,
    private readonly invoicesService: InvoicesService,
  ) {}

  @OnDomainEvent('payment.receipt.created')
  async handle(event: PaymentReceiptCreatedEvent) {
    try {
      await this.process(event);
    } catch (error) {
      this.logger.error(
        `No se pudo generar la factura de intereses del recibo ${event.receiptId}: ${(error as Error).message}`,
      );
    }
  }

  private async process(event: PaymentReceiptCreatedEvent) {
    const receipt = await this.billingSources.findReceiptForInterestInvoice(
      event.tenantId,
      event.receiptId,
    );
    if (!receipt) return;

    const interestItems = receipt.items.filter(
      (i) => i.kind === 'INTEREST_COMPONENT',
    );
    if (interestItems.length === 0) return;

    // Un ítem por cuota cubierta en este cobro — suma todos los componentes
    // (gastos administrativos, mora, etc.) de esa cuota en una sola línea:
    // "Intereses moratorios correspondientes a la cuota N° X de la Factura a
    // Crédito N° Y". Un recibo puede cubrir cuotas de varias ventas.
    const byInstallment = new Map<
      string,
      { number: number; total: Money; invoiceRef: string }
    >();
    for (const item of interestItems) {
      const saleInvoice = item.installment.loan.saleOrder.invoice;
      const prev = byInstallment.get(item.installmentId) ?? {
        number: item.installmentNumber,
        total: money(0),
        invoiceRef: saleInvoice
          ? ` de la Factura a Crédito N° ${saleInvoice.invoicePrefix ?? ''}${saleInvoice.invoiceNumber ?? ''}`
          : '',
      };
      prev.total = prev.total.plus(money(item.amountApplied));
      byInstallment.set(item.installmentId, prev);
    }

    const items = [...byInstallment.values()]
      .sort((a, b) => a.number - b.number)
      .map(({ number, total, invoiceRef }) => {
        const { ivaAmount, unitPriceWithoutIva } = ivaBreakdown(total);
        return {
          description: `Intereses moratorios correspondientes a la cuota N° ${number}${invoiceRef}`,
          quantity: 1,
          unitPrice: total,
          total,
          ivaRate: IVA_RATE,
          ivaAmount,
          unitPriceWithoutIva,
        };
      });

    await this.invoicesService.createInterestInvoiceFromReceipt(
      event.tenantId,
      {
        paymentReceiptId: receipt.id,
        branchId: receipt.branchId,
        issuedAt: receipt.issuedAt,
        items,
      },
    );
  }
}
