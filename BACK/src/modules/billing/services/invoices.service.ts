import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { BillingSourcesRepository } from '../repositories/billing-sources.repository';
import { CreditNotesRepository } from '../repositories/credit-notes.repository';
import { InvoicesRepository } from '../repositories/invoices.repository';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { IssueInvoiceDto } from '../dto/issue-invoice.dto';
import { OutboxService } from '../../../outbox/outbox.service';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly creditNotesRepository: CreditNotesRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly outbox: OutboxService,
    private readonly billingSources: BillingSourcesRepository,
  ) {}

  findAll(tenantId: string) {
    return this.invoicesRepository.findAll(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.invoicesRepository.findById(tenantId, id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  findCreditNotes(tenantId: string) {
    return this.creditNotesRepository.findAll(tenantId);
  }

  async issue(
    tenantId: string,
    id: string,
    dto: IssueInvoiceDto,
    userId?: string,
  ) {
    const invoice = await this.findOne(tenantId, id);
    if (!invoice.saleOrder) {
      // No debería pasar nunca en la práctica: issue() solo se llama sobre
      // facturas de venta (invoiceType SALE) recién creadas por
      // billing-on-sale.listener.ts. Las de intereses moratorios se crean
      // directo en estado PAID vía createInterestInvoiceFromReceipt(), nunca
      // pasan por acá.
      throw new UnprocessableEntityException(
        'Esta factura no corresponde a un pedido de venta',
      );
    }
    if (invoice.status !== 'PENDING') {
      throw new UnprocessableEntityException(
        'Solo se pueden emitir facturas en estado borrador (PENDING)',
      );
    }
    if (dto.paymentCondition === 'CREDIT' && !dto.dueDate) {
      throw new UnprocessableEntityException(
        'La fecha de vencimiento es obligatoria para ventas a crédito',
      );
    }

    // Numeración oficial (establecimiento-puntoExpedición-secuencial) —
    // nunca se tipea manualmente, la calcula el servidor. Mismo criterio
    // "buscar el último e incrementar" que LoansService.createPaymentReceipt().
    const saleOrder = invoice.saleOrder;
    await this.prisma.$transaction(async (tx) => {
      const establecimiento = saleOrder.branch?.codigoEstablecimiento || '001';
      const puntoExpedicion = saleOrder.branch?.puntoExpedicion || '001';

      const last = await this.invoicesRepository.findLastSequential(
        tenantId,
        establecimiento,
        puntoExpedicion,
        tx,
      );
      const sequential = (last?.sequential ?? 0) + 1;

      await this.invoicesRepository.updateStatus(
        tenantId,
        id,
        'ISSUED',
        {
          issuedAt: new Date(),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
          paymentMethod: dto.paymentMethod ?? null,
          establecimiento,
          puntoExpedicion,
          sequential,
          invoiceNumber: String(sequential).padStart(7, '0'),
          invoicePrefix: `${establecimiento}-${puntoExpedicion}-`,
          notes: dto.notes,
        },
        tx,
      );
    });

    // El comprobante (PDF) es obligatorio para que la factura quede
    // realmente emitida — si se corta la conexión con el backend (o falla
    // el renderizado) justo en este tramo, no puede quedar "emitida" sin
    // documento y sin forma de reintentar. Por eso 'invoice.duedate.selected'
    // (reprograma las cuotas ANTES de generar el PDF, que imprime la fecha
    // de la primera cuota) y 'invoice.pdf.requested' (el único listener que
    // genera el PDF, ver invoice-on-issue.listener.ts) van en su propio
    // try/catch, separados de 'invoice.issued' de abajo: si cualquiera de
    // los dos falla, revertimos la factura a PENDING (libera también la
    // numeración fiscal recién asignada) y no llegamos a disparar
    // 'invoice.issued', que sí dispara efectos críticos e irreversibles en
    // otros módulos (cuenta por cobrar, movimiento de stock) que no
    // queremos revertir a mitad de camino.
    try {
      if (dto.paymentCondition === 'CREDIT' && dto.dueDate) {
        await this.eventEmitter.emitAsync('invoice.duedate.selected', {
          tenantId,
          saleOrderId: invoice.saleOrderId,
          dueDate: dto.dueDate,
        });
      }

      await this.eventEmitter.emitAsync('invoice.pdf.requested', {
        tenantId,
        invoiceId: id,
        saleOrderId: invoice.saleOrderId,
        paymentCondition: dto.paymentCondition,
        total: Number(invoice.total),
        dueDate: dto.dueDate ?? null,
        issuedById: userId,
      });
    } catch {
      await this.invoicesRepository.updateStatus(tenantId, id, 'PENDING', {
        issuedAt: null,
        dueDate: null,
        paymentMethod: null,
        establecimiento: null,
        puntoExpedicion: null,
        sequential: null,
        invoiceNumber: null,
        invoicePrefix: null,
        notes: null,
      });
      throw new UnprocessableEntityException(
        'No se pudo generar el comprobante de la factura (se perdió la conexión con el servidor). La factura volvió a borrador — revisá la conexión e intentá emitirla de nuevo.',
      );
    }

    // emitAsync (no emit): payments/sales reaccionan de forma síncrona
    // (cuenta por cobrar, stock) — para esta altura el PDF ya existe, así
    // que esto solo dispara efectos de negocio que no dependen de él.
    //
    // Va por el outbox: si un listener falla (p.ej. se cae la base al crear
    // la cuenta por cobrar) se reintenta en vez de quedar la factura emitida
    // sin su cuenta por cobrar. Se encola recién acá, con el PDF ya generado,
    // porque antes la emisión todavía puede revertirse a borrador.
    const issuedEvent = await this.outbox.enqueue(
      this.prisma,
      tenantId,
      'invoice.issued',
      {
        tenantId,
        invoiceId: id,
        saleOrderId: invoice.saleOrderId,
        paymentCondition: dto.paymentCondition,
        total: Number(invoice.total),
        dueDate: dto.dueDate ?? null,
        issuedById: userId,
      },
    );
    await this.outbox.dispatch(issuedEvent);

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action: 'invoice.issued',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.invoicesRepository.findById(tenantId, id);
  }

  // Factura de intereses moratorios — se crea ya PAID (el interés ya se
  // cobró en el pago que la origina) y sin AR asociada, a diferencia de
  // issue() que arranca en PENDING y espera un cobro posterior. Numeración
  // mismo criterio (buscar el último e incrementar), mismo pool
  // establecimiento/puntoExpedicion que las facturas de venta del tenant.
  async createInterestInvoiceFromReceipt(
    tenantId: string,
    params: {
      paymentReceiptId: string;
      branchId: string | null;
      issuedAt: Date;
      items: {
        description: string;
        quantity: number;
        unitPrice: number;
        total: number;
        ivaRate: number;
        ivaAmount: number;
        unitPriceWithoutIva: number;
      }[];
    },
  ) {
    const total = params.items.reduce((s, i) => s + i.total, 0);

    const invoice = await this.prisma.$transaction(async (tx) => {
      let establecimiento = '001';
      let puntoExpedicion = '001';
      if (params.branchId) {
        const branch = await this.billingSources.findBranchNumbering(
          tenantId,
          params.branchId,
          tx,
        );
        establecimiento = branch?.codigoEstablecimiento || '001';
        puntoExpedicion = branch?.puntoExpedicion || '001';
      }

      const last = await this.invoicesRepository.findLastSequential(
        tenantId,
        establecimiento,
        puntoExpedicion,
        tx,
      );
      const sequential = (last?.sequential ?? 0) + 1;

      return this.invoicesRepository.createInterestInvoice(
        tenantId,
        {
          paymentReceiptId: params.paymentReceiptId,
          establecimiento,
          puntoExpedicion,
          sequential,
          invoiceNumber: String(sequential).padStart(7, '0'),
          invoicePrefix: `${establecimiento}-${puntoExpedicion}-`,
          total,
          issuedAt: params.issuedAt,
          items: params.items,
        },
        tx,
      );
    });

    await this.eventEmitter.emitAsync('invoice.interest.issued', {
      tenantId,
      invoiceId: invoice.id,
      paymentReceiptId: params.paymentReceiptId,
      total,
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'billing',
      action: 'invoice.interest.issued',
      resourceId: invoice.id,
    } satisfies AuditLogEvent);

    return invoice;
  }

  async cancel(tenantId: string, id: string, reason: string, userId?: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status === 'CANCELLED') {
      throw new UnprocessableEntityException('La factura ya está cancelada');
    }
    if (invoice.status === 'PAID') {
      throw new UnprocessableEntityException(
        'Las facturas pagadas no pueden cancelarse. Emita una nota de crédito.',
      );
    }

    const needsCreditNote = invoice.status === 'ISSUED';

    // Atomic: both the status change and the credit note creation succeed or both rollback.
    await this.prisma.$transaction(async (tx) => {
      await this.invoicesRepository.updateStatus(
        tenantId,
        id,
        'CANCELLED',
        undefined,
        tx,
      );

      if (needsCreditNote) {
        // generateNumber uses a COUNT, acceptable for v1 (low concurrency on cancellations).
        const number =
          await this.creditNotesRepository.generateNumber(tenantId);
        await this.creditNotesRepository.create(
          {
            tenantId,
            invoiceId: id,
            reason,
            total: invoice.total.toString(),
            number,
          },
          tx,
        );
      }
    });

    this.eventEmitter.emit('invoice.cancelled', { tenantId, invoiceId: id });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action: 'invoice.cancelled',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.invoicesRepository.findById(tenantId, id);
  }
}
