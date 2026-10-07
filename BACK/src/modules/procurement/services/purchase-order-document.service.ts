import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuditLogEvent } from '../../../audit/audit-log.event';
import { EmailService } from '../../../email/email.service';
import { FilesService } from '../../../files/files.service';
import { PurchaseOrdersRepository } from '../repositories/purchase-orders.repository';

/**
 * El documento de la orden de compra: el PDF que recibe el proveedor y su
 * envío por email. El PDF lo arma Documentos (plantillas); acá solo se pide
 * por evento, para no acoplar Compras a ese módulo.
 */
@Injectable()
export class PurchaseOrderDocumentService {
  constructor(
    private readonly purchaseOrdersRepository: PurchaseOrdersRepository,
    private readonly filesService: FilesService,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Devuelve la orden con su PDF, generándolo si todavía no existe. */
  async ensurePdf(tenantId: string, id: string, userId?: string) {
    const order = await this.getOrderOrFail(tenantId, id);
    if (order.pdfFileId) return order;

    // emitAsync espera al generador; la generación es best-effort, así que
    // el resultado se confirma releyendo la orden.
    await this.eventEmitter.emitAsync('purchase.order.pdf.requested', {
      tenantId,
      purchaseOrderId: id,
      requestedById: userId,
    });

    const updated = await this.getOrderOrFail(tenantId, id);
    if (!updated.pdfFileId) {
      throw new UnprocessableEntityException(
        'No se pudo generar el PDF. Volvé a intentar en unos segundos.',
      );
    }
    return updated;
  }

  /** Manda el PDF al proveedor (o a `to`, si se indica otra dirección). */
  async emailToSupplier(
    tenantId: string,
    id: string,
    to?: string,
    userId?: string,
  ) {
    const order = await this.ensurePdf(tenantId, id, userId);

    const recipient = to?.trim() || order.supplier.email;
    if (!recipient) {
      throw new BadRequestException(
        'El proveedor no tiene un email cargado. Indicá a qué dirección enviar la orden.',
      );
    }

    const file = await this.filesService.getById(tenantId, order.pdfFileId!);
    const buffer = await this.filesService.getFileBuffer(file);
    const number = order.orderNumber ?? order.id;

    const delivery = await this.emailService.sendWithAttachment({
      tenantId,
      to: recipient,
      subject: `Orden de compra ${number}`,
      html: `<p>Estimados:</p><p>Adjuntamos la orden de compra <strong>${number}</strong>.</p><p>Por favor confirmen su recepción.</p>`,
      attachment: {
        filename: file.originalName,
        content: buffer,
        contentType: file.mimeType,
      },
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'procurement',
      action: 'purchase.order.emailed',
      resourceId: id,
      after: { to: recipient },
    } satisfies AuditLogEvent);

    return { to: delivery.to, accepted: delivery.accepted };
  }

  private async getOrderOrFail(tenantId: string, id: string) {
    const order = await this.purchaseOrdersRepository.findById(tenantId, id);
    if (!order) throw new NotFoundException('Purchase order not found');
    return order;
  }
}
