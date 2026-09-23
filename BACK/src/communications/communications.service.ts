import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { createHash } from 'node:crypto';
import type { CommunicationMessage } from '@prisma/client';
import type { AuditLogEvent } from '../audit/audit-log.event';
import { FilesService } from '../files/files.service';
import { CommunicationsRepository } from './communications.repository';
import {
  CommunicationDeliveryError,
  CommunicationsEmailProvider,
} from './communications-email.provider';
import {
  INVOICE_TEMPLATE_CODE,
  renderInvoiceTemplate,
} from './communications-template';

export const COMMUNICATION_MAX_ATTEMPTS = 5;
export const COMMUNICATION_STALE_MS = 15 * 60_000;

export function communicationRetryDelay(attempt: number): number {
  return Math.min(30_000 * 2 ** Math.max(attempt - 1, 0), 60 * 60_000);
}

const PREPARATION_FAILURE = Symbol('communication.preparationFailure');
type PreparationFailure = { code: string; safeReason: string };

function knownPreparationFailure<T extends HttpException>(
  exception: T,
  code: string,
  safeReason: string,
): T {
  Object.defineProperty(exception, PREPARATION_FAILURE, {
    value: { code, safeReason } satisfies PreparationFailure,
  });
  return exception;
}

function preparationFailure(error: unknown): PreparationFailure | undefined {
  if (!(error instanceof HttpException)) return undefined;
  return (
    error as HttpException & { [PREPARATION_FAILURE]?: PreparationFailure }
  )[PREPARATION_FAILURE];
}

@Injectable()
export class CommunicationsService {
  constructor(
    private readonly repository: CommunicationsRepository,
    private readonly files: FilesService,
    private readonly provider: CommunicationsEmailProvider,
    private readonly events: EventEmitter2,
  ) {}

  async queueInvoiceAutomatically(
    tenantId: string,
    invoiceId: string,
    actorUserId?: string,
  ) {
    try {
      return await this.queueInvoice(tenantId, invoiceId, actorUserId, true);
    } catch (error) {
      const failure = preparationFailure(error);
      if (!failure) throw error;
      if (actorUserId) {
        await this.repository.recordAutomaticFailure({
          tenantId,
          invoiceId,
          userId: actorUserId,
          code: failure.code,
          reason: failure.safeReason,
        });
      }
      return null;
    }
  }

  async queueInvoice(
    tenantId: string,
    invoiceId: string,
    actorUserId?: string,
    automatic = false,
  ) {
    const settings = await this.repository.settings(tenantId);
    if (
      !settings?.enabled ||
      !settings.emailEnabled ||
      (automatic && !settings.invoiceEmailEnabled)
    ) {
      if (automatic) return null;
      throw new ServiceUnavailableException(
        'El Centro de Comunicaciones o su correo están desactivados para este tenant.',
      );
    }
    const idempotencyKey = `invoice:${invoiceId}:issued`;
    const existing = await this.repository.byKey(tenantId, idempotencyKey);
    if (existing) return existing;
    const invoice = await this.repository.invoice(tenantId, invoiceId);
    if (!invoice)
      throw knownPreparationFailure(
        new NotFoundException('Factura no encontrada'),
        'INVOICE_NOT_FOUND',
        'Factura no encontrada.',
      );
    if (!['ISSUED', 'PAID'].includes(invoice.status) || !invoice.pdfFileId) {
      throw knownPreparationFailure(
        new BadRequestException(
          'La factura debe estar emitida y tener su PDF guardado.',
        ),
        'INVOICE_NOT_READY',
        'La factura debe estar emitida y tener su PDF guardado.',
      );
    }
    const recipient = invoice.saleOrder?.customer.email?.trim().toLowerCase();
    if (
      !recipient ||
      !/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(recipient)
    ) {
      throw knownPreparationFailure(
        new BadRequestException(
          'El cliente de la factura no tiene un correo válido.',
        ),
        'RECIPIENT_INVALID',
        'El cliente no tiene un correo válido.',
      );
    }
    const [identity, template, file] = await Promise.all([
      this.repository.identity(tenantId),
      this.repository.template(tenantId, INVOICE_TEMPLATE_CODE),
      this.files
        .getById(tenantId, invoice.pdfFileId)
        .catch((error: unknown) => {
          if (error instanceof NotFoundException)
            throw knownPreparationFailure(
              new NotFoundException('Archivo no encontrado'),
              'PDF_NOT_FOUND',
              'No se encontró el PDF guardado de esta factura.',
            );
          throw error;
        }),
    ]);
    if (!identity)
      throw knownPreparationFailure(
        new BadRequestException(
          'Configurá una identidad predeterminada con salida habilitada.',
        ),
        'IDENTITY_MISSING',
        'Configurá una identidad predeterminada con salida habilitada.',
      );
    if (!template)
      throw knownPreparationFailure(
        new BadRequestException(
          'Publicá una versión de la plantilla INVOICE_ISSUED.',
        ),
        'TEMPLATE_MISSING',
        'Publicá una versión de la plantilla INVOICE_ISSUED.',
      );
    if (
      file.mimeType !== 'application/pdf' ||
      file.module !== 'billing' ||
      file.entityType !== 'invoice' ||
      file.entityId !== invoice.id
    ) {
      throw knownPreparationFailure(
        new BadRequestException(
          'El archivo no es el PDF guardado de esta factura.',
        ),
        'PDF_INVALID',
        'El archivo no es el PDF guardado de esta factura.',
      );
    }
    const customer = invoice.saleOrder!.customer;
    const date = (value: Date | null) =>
      value
        ? value.toLocaleDateString('es-PY', { timeZone: 'America/Asuncion' })
        : '—';
    let rendered: ReturnType<typeof renderInvoiceTemplate>;
    try {
      rendered = renderInvoiceTemplate(template.subject, template.bodyText, {
        'invoice.number': `${invoice.invoicePrefix ?? ''}${invoice.invoiceNumber ?? invoice.id}`,
        'invoice.total': Number(invoice.total).toLocaleString('es-PY'),
        'invoice.issuedAt': date(invoice.issuedAt),
        // dueDate is a calendar date persisted at UTC midnight.
        'invoice.dueDate': invoice.dueDate
          ? invoice.dueDate.toLocaleDateString('es-PY', { timeZone: 'UTC' })
          : '—',
        'customer.name': [
          customer.firstName,
          customer.secondFirstName,
          customer.lastName,
          customer.secondLastName,
        ]
          .filter(Boolean)
          .join(' '),
        'tenant.name': invoice.tenant.razonSocial ?? invoice.tenant.name,
      });
    } catch (error) {
      if (error instanceof BadRequestException)
        throw knownPreparationFailure(
          error,
          'TEMPLATE_INVALID',
          'La plantilla de factura no es válida.',
        );
      throw error;
    }
    const actor = actorUserId
      ? await this.repository.actor(tenantId, actorUserId)
      : null;
    if (actorUserId && !actor)
      throw knownPreparationFailure(
        new NotFoundException('Usuario no encontrado en el tenant'),
        'ACTOR_NOT_FOUND',
        'Usuario no encontrado en el tenant',
      );
    const message = await this.repository.createQueued({
      tenantId,
      invoiceId,
      entityType: 'INVOICE',
      entityId: invoiceId,
      recipient,
      pdfFileId: invoice.pdfFileId,
      identityId: identity.id,
      templateVersionId: template.id,
      ...rendered,
      fromEmail: identity.fromEmail,
      fromName: identity.fromName,
      replyTo: identity.replyTo,
      idempotencyKey,
      requestedBy: actor?.id,
    });
    this.audit(message, 'communications.email.queued', actor?.id);
    return message;
  }

  async retry(tenantId: string, messageId: string, actorUserId: string) {
    const settings = await this.repository.settings(tenantId);
    if (!settings?.enabled || !settings.emailEnabled) {
      throw new ServiceUnavailableException(
        'El correo del Centro de Comunicaciones está desactivado.',
      );
    }
    const message = await this.repository.message(tenantId, messageId);
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    if (message.status !== 'FAILED') {
      throw new BadRequestException(
        message.status === 'UNKNOWN'
          ? 'El resultado del envío es incierto; verificá el proveedor. No se permite reenviarlo automáticamente.'
          : 'Solo se pueden reintentar mensajes con un fallo confirmado.',
      );
    }
    const changed = await this.repository.retry(tenantId, messageId);
    if (changed.count !== 1)
      throw new BadRequestException(
        'El mensaje ya fue procesado por otra solicitud.',
      );
    this.audit(message, 'communications.email.retried', actorUserId);
    return this.repository.message(tenantId, messageId);
  }

  async process(tenantId: string, messageId: string): Promise<void> {
    const settings = await this.repository.settings(tenantId);
    if (!settings?.enabled || !settings.emailEnabled) return;
    if (!(await this.repository.activeTenant(tenantId))) return;
    const message = await this.repository.claim(
      tenantId,
      messageId,
      new Date(),
    );
    if (!message) return;
    let accepted = false;
    try {
      const invoice = await this.repository.invoice(
        tenantId,
        message.invoiceId,
      );
      if (!invoice || !['ISSUED', 'PAID'].includes(invoice.status)) {
        throw new CommunicationDeliveryError(
          'INVOICE_NOT_ISSUED',
          false,
          'La factura ya no está emitida o no está disponible.',
        );
      }
      const identity = await this.repository.activeIdentity(
        tenantId,
        message.identityId,
      );
      if (!identity)
        throw new CommunicationDeliveryError(
          'IDENTITY_DISABLED',
          false,
          'La identidad remitente está desactivada.',
        );
      // Read the pinned artifact, never regenerate from mutable invoice/customer data.
      const file = await this.files.getById(tenantId, message.pdfFileId);
      if (
        file.mimeType !== 'application/pdf' ||
        file.module !== 'billing' ||
        file.entityType !== 'invoice' ||
        file.entityId !== message.invoiceId
      ) {
        throw new CommunicationDeliveryError(
          'PDF_INVALID',
          false,
          'El adjunto no corresponde al PDF de la factura.',
        );
      }
      const content = await this.files.getFileBuffer(file);
      if (
        file.checksum &&
        createHash('sha256').update(content).digest('hex') !== file.checksum
      ) {
        throw new CommunicationDeliveryError(
          'PDF_CHECKSUM_MISMATCH',
          false,
          'El contenido del PDF guardado cambió.',
        );
      }
      const domain = message.fromEmail.split('@')[1];
      const result = await this.provider.send({
        tenantId,
        messageId: `<joapycore-${message.id}@${domain}>`,
        recipient: message.recipient,
        fromEmail: message.fromEmail,
        fromName: message.fromName,
        replyTo: message.replyTo,
        subject: message.subject,
        bodyText: message.bodyText,
        attachment: {
          filename: file.originalName,
          content,
          contentType: file.mimeType,
        },
      });
      accepted = true;
      if (
        await this.repository.finish(message, {
          status: 'SENT',
          providerMessageId: result.messageId,
        })
      ) {
        this.audit(message, 'communications.email.sent');
      }
    } catch (error) {
      // If SMTP accepted but the DB commit failed, a retry could send twice.
      const failure = accepted
        ? new CommunicationDeliveryError(
            'SMTP_OUTCOME_UNKNOWN',
            true,
            'SMTP aceptó el mensaje, pero no se pudo confirmar su estado local. Requiere revisión.',
          )
        : error instanceof CommunicationDeliveryError
          ? error
          : new CommunicationDeliveryError(
              'PREPARATION_FAILED',
              false,
              'No se pudo preparar el correo o leer su archivo guardado.',
            );
      const status = failure.ambiguous
        ? 'UNKNOWN'
        : message.attempts < COMMUNICATION_MAX_ATTEMPTS
          ? 'QUEUED'
          : 'FAILED';
      const changed = await this.repository.finish(message, {
        status,
        code: failure.code,
        error: failure.message,
        availableAt:
          status === 'QUEUED'
            ? new Date(Date.now() + communicationRetryDelay(message.attempts))
            : undefined,
      });
      if (changed)
        this.audit(message, `communications.email.${status.toLowerCase()}`);
    }
  }

  async recoverInterrupted(): Promise<void> {
    const stale = await this.repository.stale(
      new Date(Date.now() - COMMUNICATION_STALE_MS),
    );
    for (const message of stale) {
      const changed = await this.repository.finish(message, {
        status: 'UNKNOWN',
        code: 'WORKER_INTERRUPTED',
        error:
          'El worker se interrumpió durante el envío. Verificá el proveedor antes de realizar otro envío.',
      });
      if (changed) this.audit(message, 'communications.email.unknown');
    }
  }

  private audit(
    message: CommunicationMessage,
    action: string,
    userId?: string,
  ) {
    this.events.emit('audit.log', {
      tenantId: message.tenantId,
      userId: userId ?? message.requestedBy ?? undefined,
      module: 'communications',
      action,
      resourceId: message.id,
      after: {
        invoiceId: message.invoiceId,
        identityId: message.identityId,
        templateVersionId: message.templateVersionId,
        pdfFileId: message.pdfFileId,
        rule: INVOICE_TEMPLATE_CODE,
      },
    } satisfies AuditLogEvent);
  }
}
