import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import { PaymentMethod, Prisma } from '@prisma/client';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import {
  BILLING_GATEWAY,
  type BillingGateway,
} from '../../../common/contracts/billing-gateway.contract';
import {
  SALES_GATEWAY,
  type SalesGateway,
} from '../../../common/contracts/sales-gateway.contract';
import { OutboxService } from '../../../outbox/outbox.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreatePosSaleDto } from '../dto/create-pos-sale.dto';
import {
  PosSalesHistoryFilters,
  PosSalesRepository,
} from '../repositories/pos-sales.repository';
import { PosSessionsRepository } from '../repositories/pos-sessions.repository';

// La venta y su factura se guardan juntas; en una máquina lenta pueden
// pasar los 5 s que Prisma da por defecto a una transacción interactiva.
const SALE_TRANSACTION_TIMEOUT_MS = 20_000;

const toNum = (value: number | { toNumber(): number }) =>
  typeof value === 'object' ? value.toNumber() : value;

// La factura lleva una sola forma de pago: la del mayor monto cobrado.
function mainPaymentMethod(
  payments: { amount: number; paymentMethod: PaymentMethod }[],
): PaymentMethod | null {
  const main = [...payments].sort((a, b) => b.amount - a.amount)[0];
  return main?.paymentMethod ?? null;
}

@Injectable()
export class PosSalesService {
  private readonly logger = new Logger(PosSalesService.name);

  constructor(
    @Inject(SALES_GATEWAY) private readonly salesGateway: SalesGateway,
    @Inject(BILLING_GATEWAY) private readonly billing: BillingGateway,
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
    private readonly posSessionsRepository: PosSessionsRepository,
    private readonly posSalesRepository: PosSalesRepository,
    private readonly eventEmitter: EventBus,
  ) {}

  /**
   * Toda venta de caja emite su factura en la misma transacción: no quedan
   * ventas sin comprobante (Decreto 6539/05). Sin cliente elegido, la
   * factura va a "Sin Nombre".
   */
  async create(tenantId: string, dto: CreatePosSaleDto, cashierId: string) {
    const session = await this.posSessionsRepository.findActiveByCashier(
      tenantId,
      cashierId,
    );
    if (!session) {
      throw new UnprocessableEntityException(
        'No tenés una sesión de caja abierta. Abrí la caja antes de vender.',
      );
    }
    const { terminal } = session;
    if (!terminal.invoiceSeriesId) {
      throw new UnprocessableEntityException(
        `La caja ${terminal.name} no tiene una serie de facturas. Configurala en Cajas.`,
      );
    }
    const seriesId = terminal.invoiceSeriesId;
    const { documentNumber, ...sale } = dto;

    let result: {
      saleOrderId: string;
      invoiceId: string;
      eventIds: string[];
    };
    try {
      result = await this.prisma.$transaction(
        async (tx) => {
          const order = await this.salesGateway.createPosSaleInTransaction(
            tx,
            tenantId,
            sale,
            session.id,
            cashierId,
          );
          const invoice = await this.billing.issuePosInvoice(tx, tenantId, {
            saleOrderId: order.id,
            branchId: terminal.branchId,
            seriesId,
            documentNumber,
            anonymousBuyer: !dto.customerId,
            paymentMethod: mainPaymentMethod(dto.payments),
            issuedById: cashierId,
            at: new Date(),
          });
          return {
            saleOrderId: order.id,
            invoiceId: invoice.invoiceId,
            eventIds: [...order.eventIds, invoice.eventId],
          };
        },
        { timeout: SALE_TRANSACTION_TIMEOUT_MS },
      );
    } catch (error) {
      // Solo con talonario el número lo pone el cajero y puede repetirse.
      if (
        documentNumber !== undefined &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new UnprocessableEntityException(
          `El número ${documentNumber} del talonario ya fue usado en otra factura`,
        );
      }
      throw error;
    }

    for (const eventId of result.eventIds) await this.outbox.dispatch(eventId);
    this.billing.requestPdf(tenantId, result.invoiceId);

    this.eventEmitter.emit('pos.sale.created', {
      tenantId,
      saleOrderId: result.saleOrderId,
      posSessionId: session.id,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId: cashierId,
      module: 'pos',
      action: 'pos.sale.created',
      resourceId: result.saleOrderId,
    } satisfies AuditLogEvent);

    // La venta ya está registrada: si no se puede armar el comprobante, el
    // cajero lo reimprime en vez de volver a cobrar.
    let receipt: Awaited<ReturnType<PosSalesService['buildReceipt']>> | null =
      null;
    try {
      receipt = await this.buildReceipt(tenantId, result.saleOrderId, false);
    } catch (error) {
      this.logger.error(
        `No se pudo armar el comprobante de la venta ${result.saleOrderId}: ${(error as Error).message}`,
      );
    }
    return { saleOrderId: result.saleOrderId, receipt };
  }

  /**
   * Reimpresión: siempre sale como copia (RG 27/19, art. 3) y queda en la
   * auditoría. El original solo viaja en la respuesta del cobro.
   */
  async reprint(tenantId: string, saleOrderId: string, userId?: string) {
    const receipt = await this.buildReceipt(tenantId, saleOrderId, true);
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'pos',
      action: 'pos.receipt.reprinted',
      resourceId: saleOrderId,
    } satisfies AuditLogEvent);
    return receipt;
  }

  private async buildReceipt(
    tenantId: string,
    saleOrderId: string,
    copy: boolean,
  ) {
    const sale = await this.posSalesRepository.findForReceipt(
      tenantId,
      saleOrderId,
    );
    if (!sale?.posSession) throw new NotFoundException('Venta no encontrada');
    const fiscal = await this.billing.findReceiptBySaleOrder(
      tenantId,
      saleOrderId,
    );
    if (!fiscal) {
      throw new NotFoundException('La venta no tiene factura emitida');
    }
    // Con talonario cada impresión es sobre la hoja: queda registrada.
    if (fiscal.modality === 'PREPRINTED') {
      await this.billing.recordFormPrint(tenantId, fiscal.invoiceId);
    }

    const payments = sale.salePayments.map((p) => ({
      paymentMethod: p.paymentMethod,
      amount: toNum(p.amount),
    }));
    const paid = payments.reduce((sum, p) => sum + p.amount, 0);
    const { terminal, cashier } = sale.posSession;
    return {
      ...fiscal,
      copy,
      terminalName: terminal.name,
      cashierName: [cashier.firstName, cashier.lastName].join(' '),
      printFormat: terminal.printFormat,
      paperConservation: terminal.thermalPaperConservation,
      payments,
      change: Math.max(0, paid - fiscal.totals.total),
    };
  }

  listBySession(tenantId: string, sessionId: string) {
    return this.posSalesRepository.findBySession(tenantId, sessionId);
  }

  listHistory(tenantId: string, filters: PosSalesHistoryFilters) {
    return this.posSalesRepository.findHistory(tenantId, filters);
  }
}
