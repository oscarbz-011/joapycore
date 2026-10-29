import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditNotesRepository } from '../repositories/credit-notes.repository';
import { InvoicesRepository } from '../repositories/invoices.repository';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { AssignInvoiceNumberDto } from '../dto/assign-invoice-number.dto';
import { IssueInvoiceDto } from '../dto/issue-invoice.dto';
import { OutboxService } from '../../../outbox/outbox.service';
import type { SeriesNumbering } from '../types/series-numbering';
import { BillingSeriesService } from './billing-series.service';

// Un número de talonario que otra emisión simultánea usó primero choca
// contra el índice único de la serie.
function isDuplicateNumber(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly creditNotesRepository: CreditNotesRepository,
    private readonly eventEmitter: EventBus,
    private readonly outbox: OutboxService,
    private readonly seriesService: BillingSeriesService,
  ) {}

  findAll(tenantId: string) {
    return this.invoicesRepository.findAll(tenantId);
  }

  findInterestInvoices(tenantId: string) {
    return this.invoicesRepository.findInterestInvoices(tenantId);
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.invoicesRepository.findById(tenantId, id);
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  findCreditNotes(tenantId: string) {
    return this.creditNotesRepository.findAll(tenantId);
  }

  // Series entre las que se puede elegir al emitir esta factura (o al
  // numerar una factura de intereses que quedó sin número).
  async findSeriesOptions(tenantId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.invoiceType === 'INTEREST') {
      return this.findInterestSeriesOptions(tenantId, id);
    }
    return this.seriesService.findIssueOptions(
      tenantId,
      invoice.saleOrder?.branchId ?? null,
    );
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
    const attemptAt = invoice.pdfFileId
      ? invoice.issuedAt!
      : new Date(Math.max(Date.now(), (invoice.issuedAt?.getTime() ?? 0) + 1));
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
      if (
        invoice.sequential != null &&
        dto.documentNumber !== undefined &&
        dto.documentNumber !== invoice.sequential
      ) {
        throw new UnprocessableEntityException(
          `La factura ya tiene reservado el número ${invoice.sequential}; reintentá con ese número`,
        );
      }

      // Primero se reservan la numeración y los datos que necesita el PDF,
      // pero la factura sigue PENDING hasta que se guarde el comprobante.
      // Si un intento anterior reservó el número y se interrumpió antes del
      // PDF, se reutiliza para que el reintento sea idempotente.
      let preprintedEvent: string | null;
      try {
        preprintedEvent = await this.prisma.$transaction(async (tx) => {
          const numbering =
            invoice.sequential == null
              ? await this.seriesService.numberForIssue(
                  tenantId,
                  {
                    branchId: saleOrder.branchId ?? null,
                    seriesId: dto.seriesId,
                    documentNumber: dto.documentNumber,
                    at: attemptAt,
                  },
                  tx,
                )
              : null;

          if ((numbering?.modality ?? invoice.modality) === 'PREPRINTED') {
            return this.issuePreprintedInTransaction(tx, tenantId, {
              invoice,
              numbering,
              dto,
              attemptAt,
              userId,
            });
          }

          const claimed = await this.invoicesRepository.claimIssue(
            tenantId,
            id,
            invoice.updatedAt,
            attemptAt,
            {
              dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
              paymentMethod: dto.paymentMethod ?? null,
              notes: dto.notes,
              ...(numbering ?? {}),
            },
            tx,
          );
          if (claimed.count !== 1) {
            throw new UnprocessableEntityException(
              'La factura ya está siendo emitida o cambió de estado. Recargá antes de reintentar.',
            );
          }
          return null;
        });
      } catch (error) {
        if (isDuplicateNumber(error)) {
          throw new UnprocessableEntityException(
            `El número ${dto.documentNumber ?? ''} del talonario ya fue usado en otra factura`,
          );
        }
        throw error;
      }

      if (preprintedEvent) {
        await this.outbox.dispatch(preprintedEvent);
        this.eventEmitter.emit('audit.log', {
          tenantId,
          userId,
          module: 'billing',
          action: 'invoice.issued',
          resourceId: id,
        } satisfies AuditLogEvent);
        return this.invoicesRepository.findById(tenantId, id);
      }

      // Los listeners críticos declaran suppressErrors:false para que
      // emitAsync rechace realmente si falla la reprogramación o el renderer.
      try {
        if (
          dto.paymentCondition === 'CREDIT' &&
          dto.dueDate &&
          invoice.saleOrderId
        ) {
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
          attemptAt,
          expectedStatus: 'PENDING',
        });

        // No alcanza con que el listener resuelva: se verifica la postcondición
        // persistida que habilita la emisión.
        if (!(await this.invoicesRepository.hasPdf(tenantId, id))) {
          throw new Error('El generador terminó sin vincular el archivo PDF');
        }
      } catch {
        // Un enlace PDF confirmado o una reclamación posterior no se tocan.
        // Solo la reclamación propia sin PDF puede liberarse.
        await this.invoicesRepository.releaseIssueClaim(
          tenantId,
          id,
          attemptAt,
        );
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
        attemptAt,
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
   * Talonario de imprenta: el comprobante es la hoja preimpresa, así que la
   * factura se emite sin PDF ni correo y se imprime sobre la hoja. Devuelve
   * el evento del outbox a despachar después del commit.
   */
  private async issuePreprintedInTransaction(
    tx: Prisma.TransactionClient,
    tenantId: string,
    params: {
      invoice: NonNullable<Awaited<ReturnType<InvoicesRepository['findById']>>>;
      numbering: SeriesNumbering | null;
      dto: IssueInvoiceDto;
      attemptAt: Date;
      userId?: string;
    },
  ) {
    const { invoice, numbering, dto, attemptAt } = params;
    const seriesId = numbering?.seriesId ?? invoice.seriesId;
    if (!seriesId) {
      throw new UnprocessableEntityException('La factura no tiene serie');
    }
    const problem = await this.seriesService.formFitProblem(
      tenantId,
      seriesId,
      invoice.items.length,
      tx,
    );
    if (problem) throw new UnprocessableEntityException(problem);

    const issued = await this.invoicesRepository.issuePreprinted(
      tenantId,
      invoice.id,
      invoice.updatedAt,
      attemptAt,
      {
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        paymentMethod: dto.paymentMethod ?? null,
        notes: dto.notes,
        ...numbering,
      },
      tx,
    );
    if (issued.count !== 1) {
      throw new UnprocessableEntityException(
        'La factura ya está siendo emitida o cambió de estado. Recargá antes de reintentar.',
      );
    }
    return this.outbox.enqueue(tx, tenantId, 'invoice.issued', {
      tenantId,
      invoiceId: invoice.id,
      saleOrderId: invoice.saleOrderId,
      paymentCondition: dto.paymentCondition,
      total: Number(invoice.total),
      dueDate: dto.dueDate ?? null,
      issuedById: params.userId,
    });
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
    if (invoice.modality === 'PREPRINTED') {
      throw new UnprocessableEntityException(
        'Una factura de talonario no tiene PDF: se imprime sobre la hoja del talonario',
      );
    }
    if (invoice.pdfFileId) return invoice;
    if (!invoice.issuedAt) {
      throw new UnprocessableEntityException(
        'La factura no tiene una fecha de emisión válida para regenerar el PDF',
      );
    }

    try {
      await this.eventEmitter.emitAsync('invoice.pdf.requested', {
        tenantId,
        invoiceId: id,
        saleOrderId: invoice.saleOrderId,
        paymentCondition: invoice.saleOrder.saleType,
        total: Number(invoice.total),
        dueDate: invoice.dueDate?.toISOString() ?? null,
        issuedById: userId,
        attemptAt: invoice.issuedAt,
        expectedStatus: invoice.status,
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
  // issue() que arranca en PENDING y espera un cobro posterior. La numera la
  // serie de impresión propia de la sucursal; si la sucursal factura con
  // talonario, queda sin número (y sin PDF) hasta que alguien lo cargue.
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
      const numbering = await this.seriesService.numberForAutomatic(
        tenantId,
        params.branchId,
        params.issuedAt,
        tx,
      );

      return this.invoicesRepository.createInterestInvoice(
        tenantId,
        {
          paymentReceiptId: params.paymentReceiptId,
          numbering,
          total,
          issuedAt: params.issuedAt,
          items: params.items,
        },
        tx,
      );
    });

    if (invoice.sequential != null) {
      await this.eventEmitter.emitAsync('invoice.interest.issued', {
        tenantId,
        invoiceId: invoice.id,
        paymentReceiptId: params.paymentReceiptId,
        total,
      });
    }

    this.eventEmitter.emit('audit.log', {
      tenantId,
      module: 'billing',
      action: 'invoice.interest.issued',
      resourceId: invoice.id,
    } satisfies AuditLogEvent);

    return invoice;
  }

  // Carga el número del talonario (o lo asigna una serie de impresión propia)
  // a una factura de intereses que se generó sin numerar.
  async assignInterestNumber(
    tenantId: string,
    id: string,
    dto: AssignInvoiceNumberDto,
    userId?: string,
  ) {
    const invoice = await this.invoicesRepository.findInterestForNumbering(
      tenantId,
      id,
    );
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.sequential != null) {
      throw new UnprocessableEntityException('La factura ya tiene número');
    }

    let numberedWith: SeriesNumbering['modality'];
    try {
      numberedWith = await this.prisma.$transaction(async (tx) => {
        const numbering = await this.seriesService.numberForIssue(
          tenantId,
          {
            branchId: invoice.paymentReceipt?.branchId ?? null,
            seriesId: dto.seriesId,
            documentNumber: dto.documentNumber,
            at: invoice.issuedAt ?? new Date(),
          },
          tx,
        );
        const assigned = await this.invoicesRepository.assignNumber(
          tenantId,
          id,
          numbering,
          tx,
        );
        if (assigned.count !== 1) {
          throw new UnprocessableEntityException(
            'Otra persona numeró la factura al mismo tiempo. Recargá la página.',
          );
        }
        return numbering.modality;
      });
    } catch (error) {
      if (isDuplicateNumber(error)) {
        throw new UnprocessableEntityException(
          `El número ${dto.documentNumber ?? ''} del talonario ya fue usado en otra factura`,
        );
      }
      throw error;
    }

    // Con talonario el comprobante es la hoja: no se genera el PDF.
    if (numberedWith !== 'PREPRINTED') {
      await this.eventEmitter.emitAsync('invoice.interest.issued', {
        tenantId,
        invoiceId: id,
        paymentReceiptId: invoice.paymentReceiptId,
        total: Number(invoice.total),
      });
    }
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action: 'invoice.interest.numbered',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.invoicesRepository.findById(tenantId, id);
  }

  private async findInterestSeriesOptions(tenantId: string, id: string) {
    const invoice = await this.invoicesRepository.findInterestForNumbering(
      tenantId,
      id,
    );
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.seriesService.findIssueOptions(
      tenantId,
      invoice.paymentReceipt?.branchId ?? null,
      invoice.issuedAt ?? new Date(),
    );
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

    const cancellableStatus = invoice.status;
    const needsCreditNote = invoice.status === 'ISSUED';

    // Atomic: both the status change and the credit note creation succeed or both rollback.
    await this.prisma.$transaction(async (tx) => {
      const cancelled = await this.invoicesRepository.cancelIfAllowed(
        tenantId,
        id,
        cancellableStatus,
        invoice.updatedAt,
        new Date(),
        tx,
      );
      if (cancelled.count !== 1) {
        throw new UnprocessableEntityException(
          'La factura está siendo emitida o cambió de estado. Recargá antes de cancelarla.',
        );
      }

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
