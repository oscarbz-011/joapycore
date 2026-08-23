import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../../prisma/prisma.service';
import { CreditNotesRepository } from '../repositories/credit-notes.repository';
import { InvoicesRepository } from '../repositories/invoices.repository';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { IssueInvoiceDto } from '../dto/issue-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicesRepository: InvoicesRepository,
    private readonly creditNotesRepository: CreditNotesRepository,
    private readonly eventEmitter: EventEmitter2,
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

  async issue(tenantId: string, id: string, dto: IssueInvoiceDto, userId?: string) {
    const invoice = await this.findOne(tenantId, id);
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
    await this.prisma.$transaction(async (tx) => {
      const establecimiento = invoice.saleOrder.branch?.codigoEstablecimiento || '001';
      const puntoExpedicion = invoice.saleOrder.branch?.puntoExpedicion || '001';

      const last = await tx.invoice.findFirst({
        where: { tenantId, establecimiento, puntoExpedicion },
        orderBy: { sequential: 'desc' },
        select: { sequential: true },
      });
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

    // Si se eligió un vencimiento distinto al default, Finanzas reprograma
    // las cuotas del préstamo ANTES de que se genere el PDF de la factura
    // (que imprime la fecha de la primera cuota) — evento separado y
    // esperado, para no depender del orden en que corren dos listeners de
    // 'invoice.issued' en paralelo.
    if (dto.paymentCondition === 'CREDIT' && dto.dueDate) {
      await this.eventEmitter.emitAsync('invoice.duedate.selected', {
        tenantId,
        saleOrderId: invoice.saleOrderId,
        dueDate: dto.dueDate,
      });
    }

    // emitAsync (no emit): el PDF de la factura se genera de forma síncrona
    // dentro de un listener del módulo Documentos — esperamos a que termine
    // para poder devolver pdfFileId ya listo en la misma respuesta.
    await this.eventEmitter.emitAsync('invoice.issued', {
      tenantId,
      invoiceId: id,
      saleOrderId: invoice.saleOrderId,
      paymentCondition: dto.paymentCondition,
      total: Number(invoice.total),
      dueDate: dto.dueDate ?? null,
      issuedById: userId,
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'billing',
      action: 'invoice.issued',
      resourceId: id,
    } satisfies AuditLogEvent);

    return this.invoicesRepository.findById(tenantId, id);
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
      await this.invoicesRepository.updateStatus(tenantId, id, 'CANCELLED', undefined, tx);

      if (needsCreditNote) {
        // generateNumber uses a COUNT, acceptable for v1 (low concurrency on cancellations).
        const number = await this.creditNotesRepository.generateNumber(tenantId);
        await this.creditNotesRepository.create(
          { tenantId, invoiceId: id, reason, total: invoice.total.toString(), number },
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
