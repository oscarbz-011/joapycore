import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { InvoicesService } from '../services/invoices.service';

interface PaymentReceiptCreatedEvent {
  tenantId: string;
  receiptId: string;
}

const IVA_RATE = 10;

function ivaBreakdown(total: number): {
  ivaAmount: number;
  unitPriceWithoutIva: number;
} {
  // IVA incluido en el monto cobrado (criterio general de retail en
  // Paraguay) — mismo desglose que se mostraría en una factura de venta
  // normal si esa lógica estuviera implementada (hoy no lo está en ningún
  // lado del código: InvoiceItem.ivaRate siempre es null en la práctica).
  const ivaAmount = Math.round(total - total / (1 + IVA_RATE / 100));
  return { ivaAmount, unitPriceWithoutIva: total - ivaAmount };
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
    private readonly prisma: PrismaService,
    private readonly invoicesService: InvoicesService,
  ) {}

  @OnEvent('payment.receipt.created')
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
    const receipt = await this.prisma.paymentReceipt.findFirst({
      where: { id: event.receiptId, tenantId: event.tenantId },
      include: {
        items: true,
        loan: {
          include: {
            saleOrder: { include: { invoice: true } },
          },
        },
      },
    });
    if (!receipt) return;

    const interestItems = receipt.items.filter(
      (i) => i.kind === 'INTEREST_COMPONENT',
    );
    if (interestItems.length === 0) return;

    const saleInvoice = receipt.loan.saleOrder.invoice;
    const invoiceRef = saleInvoice
      ? ` de la Factura a Crédito N° ${saleInvoice.invoicePrefix ?? ''}${saleInvoice.invoiceNumber ?? ''}`
      : '';

    // Un ítem por cuota cubierta en este cobro — suma todos los componentes
    // (gastos administrativos, mora, etc.) de esa cuota en una sola línea,
    // tal como lo pidió el usuario ("Intereses moratorios correspondientes
    // a la cuota N° X de la Factura a Crédito N° Y").
    const byInstallment = new Map<number, number>();
    for (const item of interestItems) {
      const prev = byInstallment.get(item.installmentNumber) ?? 0;
      byInstallment.set(
        item.installmentNumber,
        prev + Number(item.amountApplied),
      );
    }

    const items = [...byInstallment.entries()]
      .sort(([a], [b]) => a - b)
      .map(([installmentNumber, total]) => {
        const { ivaAmount, unitPriceWithoutIva } = ivaBreakdown(total);
        return {
          description: `Intereses moratorios correspondientes a la cuota N° ${installmentNumber}${invoiceRef}`,
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
