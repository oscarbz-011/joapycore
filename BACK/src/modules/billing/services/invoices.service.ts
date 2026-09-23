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

    const saleOrder = invoice.saleOrder;
    if (invoice.pdfFileId) {
      // El PDF ya fue guardado, pero falló la transacción final de emisión.
      // No se puede cambiar lo que imprime ese comprobante en el reintento.
      if (
        !invoice.issuedAt ||
        invoice.sequential == null ||
        dto.paymentCondition !== saleOrder.saleType ||
        (invoice.dueDate?.toISOString().slice(0, 10) ?? null) !==
          (dto.dueDate?.slice(0, 10) ?? null) ||
        (invoice.paymentMethod ?? null) !== (dto.paymentMethod ?? null) ||
        (invoice.notes ?? null) !== (dto.notes ?? null)
      ) {
        throw new UnprocessableEntityException(
          'La factura ya tiene un PDF guardado con otros datos de emisión. Recargá la factura antes de reintentar.',
        );
      }
    } else {
      // Primero se reservan la numeración y los datos que necesita el PDF,
      // pero la factura sigue PENDING hasta que se guarde el comprobante.
      const issuedAt = new Date();
      await this.prisma.$transaction(async (tx) => {
        const establecimiento =
          saleOrder.branch?.codigoEstablecimiento || '001';
        const puntoExpedicion = saleOrder.branch?.puntoExpedicion || '001';

        // Si un intento anterior reservó el número y se interrumpió antes del
        // PDF, se reutiliza para que el reintento sea idempotente.
        let sequential = invoice.sequential;
        if (sequential == null) {
          const last = await this.invoicesRepository.findLastSequential(
            tenantId,
            establecimiento,
            puntoExpedicion,
            tx,
          );
          sequential = (last?.sequential ?? 0) + 1;
        }

        await this.invoicesRepository.updateStatus(
          tenantId,
          id,
          'PENDING',
          {
            issuedAt,
            dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
            paymentMethod: dto.paymentMethod ?? null,
            establecimiento,
            puntoExpedicion,
            sequential,
            invoiceNumber: String(sequential).padStart(7, '0'),
            invoicePrefix: `${establecimiento}-${puntoExpedicion}-`,
            notes: dto.notes,
            // Un PDF previo nunca puede validar este intento de emisión.
            pdfFileId: null,
          },
          tx,
        );
      });

      // Los listeners críticos declaran suppressErrors:false para que
      // emitAsync rechace realmente si falla la reprogramación o el renderer.
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

        // No alcanza con que el listener resuelva: se verifica la postcondición
        // persistida que habilita la emisión.
        if (!(await this.invoicesRepository.hasPdf(tenantId, id))) {
          throw new Error('El generador terminó sin vincular el archivo PDF');
        }
      } catch {
        // Sigue siendo borrador. La numeración reservada se conserva para el
        // reintento y no puede ser reutilizada por otra factura.
        await this.invoicesRepository.updateStatus(tenantId, id, 'PENDING', {
          issuedAt: null,
          dueDate: null,
          paymentMethod: null,
          notes: null,
          pdfFileId: null,
        });
        throw new UnprocessableEntityException(
          'No se pudo generar y guardar el PDF. La factura continúa como borrador; revisá la conexión y usá Reintentar emisión.',
        );
      }
    }

    // El cambio a ISSUED y el evento confiable se guardan en la misma
    // transacción. Si cae la base, ambos se revierten.
    const issuedEvent = await this.prisma.$transaction(async (tx) => {
      const finalized = await this.invoicesRepository.finalizeIssue(
        tenantId,
        id,
        tx,
      );
      if (finalized.count !== 1) {
        throw new UnprocessableEntityException(
          'La factura no pudo finalizarse porque el PDF no está disponible o ya fue procesada',
        );
      }

      return this.outbox.enqueue(tx, tenantId, 'invoice.issued', {
        tenantId,
        invoiceId: id,
        saleOrderId: invoice.saleOrderId,
        paymentCondition: dto.paymentCondition,
        total: Number(invoice.total),
        dueDate: dto.dueDate ?? null,
        issuedById: userId,
      });
    });
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

  /**
   * Recupera facturas históricas que quedaron emitidas sin PDF antes de que
   * la emisión exigiera esa postcondición. No vuelve a publicar
   * invoice.issued, por lo que no duplica stock ni cuentas por cobrar.
   */
  async retryPdf(tenantId: string, id: string, userId?: string) {
    const invoice = await this.findOne(tenantId, id);
    if (!invoice.saleOrder) {
      throw new UnprocessableEntityException(
        'Esta factura no corresponde a un pedido de venta',
      );
    }
    if (invoice.status === 'PENDING') {
      throw new UnprocessableEntityException(
        'La factura todavía es borrador; utilizá Reintentar emisión',
      );
    }
    if (invoice.status === 'CANCELLED') {
      throw new UnprocessableEntityException(
        'No se puede regenerar el PDF de una factura cancelada',
      );
    }
    if (invoice.pdfFileId) return invoice;

    try {
      await this.eventEmitter.emitAsync('invoice.pdf.requested', {
        tenantId,
        invoiceId: id,
        saleOrderId: invoice.saleOrderId,
        paymentCondition: invoice.saleOrder.saleType,
        total: Number(invoice.total),
        dueDate: invoice.dueDate?.toISOString() ?? null,
        issuedById: userId,
      });
      if (!(await this.invoicesRepository.hasPdf(tenantId, id))) {
        throw new Error('El generador terminó sin vincular el archivo PDF');
      }
    } catch {
      throw new UnprocessableEntityException(
        'No se pudo regenerar el PDF. Revisá la conexión y volvé a intentar.',
      );
    }

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action: 'invoice.pdf.regenerated',
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
