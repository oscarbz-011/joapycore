import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { CommunicationsService } from './communications.service';
import { renderInvoiceTemplate } from './communications-template';
import {
  CommunicationIdentityDto,
  CommunicationMessagesQueryDto,
  CommunicationNoteDto,
  CommunicationPageDto,
  CommunicationSettingsDto,
  CommunicationTemplateDto,
  UpdateCommunicationIdentityDto,
} from './hub.dto';

const TEMPLATE_CODE = 'INVOICE_ISSUED';
const MESSAGE_SUMMARY = {
  id: true,
  entityType: true,
  entityId: true,
  invoiceId: true,
  recipient: true,
  subject: true,
  fromEmail: true,
  fromName: true,
  replyTo: true,
  status: true,
  attempts: true,
  sentAt: true,
  lastError: true,
  createdAt: true,
  updatedAt: true,
  identityId: true,
  templateVersionId: true,
  pdfFileId: true,
  requestedBy: true,
} satisfies Prisma.CommunicationMessageSelect;

@Injectable()
export class CommunicationHubService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integrations: IntegrationsService,
    private readonly events: EventEmitter2,
    private readonly core: CommunicationsService,
  ) {}

  async settings(tenantId: string) {
    const settings = await this.prisma.communicationSettings.findUnique({
      where: { tenantId },
    });
    return {
      enabled: settings?.enabled ?? false,
      emailEnabled: settings?.emailEnabled ?? false,
      invoiceEmailEnabled: settings?.invoiceEmailEnabled ?? false,
    };
  }

  async updateSettings(
    tenantId: string,
    userId: string,
    dto: CommunicationSettingsDto,
  ) {
    await this.prisma.communicationSettings.upsert({
      where: { tenantId },
      create: { tenantId, ...dto },
      update: dto,
    });
    this.audit(tenantId, userId, 'settings.updated', tenantId, dto);
    return this.settings(tenantId);
  }

  private async requireEnabled(tenantId: string, email = false) {
    const flags = await this.settings(tenantId);
    if (!flags.enabled || (email && !flags.emailEnabled)) {
      throw new ServiceUnavailableException(
        'El Centro de Comunicaciones o el correo están desactivados',
      );
    }
  }

  private async invoice(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!invoice) throw new NotFoundException('Factura no encontrada');
    return invoice;
  }

  identities(tenantId: string) {
    return this.prisma.communicationIdentity.findMany({
      where: { tenantId, type: { in: ['SYSTEM', 'SHARED'] } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  private async validateIdentity(
    tenantId: string,
    dto: CommunicationIdentityDto,
  ) {
    if (
      !['SYSTEM', 'SHARED'].includes(dto.type) ||
      !dto.fromEmail ||
      typeof dto.outboundEnabled !== 'boolean' ||
      typeof dto.isDefault !== 'boolean'
    ) {
      throw new BadRequestException(
        'La identidad requiere tipo, remitente y estado válidos',
      );
    }
    if (dto.isDefault && !dto.outboundEnabled) {
      throw new BadRequestException(
        'La identidad predeterminada debe permitir envíos',
      );
    }
    if (!dto.outboundEnabled) return;
    const smtp = await this.integrations.getEnabledSmtpConfig(tenantId);
    if (!smtp)
      throw new BadRequestException(
        'Configurá y habilitá primero el SMTP de la empresa en Integraciones',
      );
    if (
      smtp.fromEmail.trim().toLowerCase() !== dto.fromEmail.trim().toLowerCase()
    ) {
      throw new BadRequestException(
        'El remitente debe coincidir con el autorizado en la integración SMTP',
      );
    }
  }

  async createIdentity(
    tenantId: string,
    userId: string,
    dto: CommunicationIdentityDto,
  ) {
    await this.validateIdentity(tenantId, dto);
    const identity = await this.prisma.$transaction(async (tx) => {
      // Serialize default selection with other identity edits for this tenant.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${tenantId + ':communication-identities'}))`;
      if (dto.isDefault)
        await tx.communicationIdentity.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
      return tx.communicationIdentity.create({
        data: {
          tenantId,
          ...dto,
          fromEmail: dto.fromEmail.trim().toLowerCase(),
        },
      });
    });
    this.audit(tenantId, userId, 'identity.created', identity.id);
    return identity;
  }

  async updateIdentity(
    tenantId: string,
    userId: string,
    id: string,
    dto: UpdateCommunicationIdentityDto,
  ) {
    const existing = await this.prisma.communicationIdentity.findFirst({
      where: { id, tenantId, type: { in: ['SYSTEM', 'SHARED'] } },
    });
    if (!existing) throw new NotFoundException('Identidad no encontrada');
    const candidate = { ...existing, ...dto } as CommunicationIdentityDto;
    await this.validateIdentity(tenantId, candidate);
    const identity = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${tenantId + ':communication-identities'}))`;
      const current = await tx.communicationIdentity.findFirst({
        where: { id, tenantId },
      });
      if (!current) throw new NotFoundException('Identidad no encontrada');
      if (
        (dto.isDefault ?? current.isDefault) &&
        !(dto.outboundEnabled ?? current.outboundEnabled)
      ) {
        throw new BadRequestException(
          'Desmarcá la identidad predeterminada antes de desactivar sus envíos',
        );
      }
      if (dto.isDefault)
        await tx.communicationIdentity.updateMany({
          where: { tenantId, isDefault: true },
          data: { isDefault: false },
        });
      const changed = await tx.communicationIdentity.updateMany({
        where: { id, tenantId },
        data: {
          ...dto,
          ...(dto.fromEmail
            ? { fromEmail: dto.fromEmail.trim().toLowerCase() }
            : {}),
        },
      });
      if (!changed.count)
        throw new NotFoundException('Identidad no encontrada');
      return tx.communicationIdentity.findFirstOrThrow({
        where: { id, tenantId },
      });
    });
    this.audit(tenantId, userId, 'identity.updated', id);
    return identity;
  }

  async deleteIdentity(tenantId: string, userId: string, id: string) {
    // Revocation preserves references even if an invoice is queued concurrently.
    const deleted = await this.prisma.communicationIdentity.updateMany({
      where: { id, tenantId, type: { in: ['SYSTEM', 'SHARED'] } },
      data: { outboundEnabled: false, isDefault: false },
    });
    if (!deleted.count) throw new NotFoundException('Identidad no encontrada');
    this.audit(tenantId, userId, 'identity.revoked', id);
    return { revoked: true };
  }

  templates(tenantId: string) {
    return this.prisma.communicationTemplateVersion.findMany({
      where: { tenantId, code: TEMPLATE_CODE },
      orderBy: { version: 'desc' },
      take: 100,
    });
  }

  previewTemplate(dto: CommunicationTemplateDto) {
    return renderInvoiceTemplate(dto.subject, dto.bodyText, {
      'invoice.number': '001-001-0000001',
      'invoice.total': '150000',
      'invoice.issuedAt': '2026-09-18',
      'invoice.dueDate': '2026-10-18',
      'customer.name': 'Cliente de ejemplo',
      'tenant.name': 'Empresa de ejemplo',
    });
  }

  async createTemplateVersion(
    tenantId: string,
    userId: string,
    dto: CommunicationTemplateDto,
  ) {
    this.previewTemplate(dto);
    const version = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtext(${tenantId + ':communication-templates'}))`;
      const previous = await tx.communicationTemplateVersion.findFirst({
        where: { tenantId, code: TEMPLATE_CODE },
        orderBy: { version: 'desc' },
      });
      return tx.communicationTemplateVersion.create({
        data: {
          tenantId,
          code: TEMPLATE_CODE,
          version: (previous?.version ?? 0) + 1,
          ...dto,
          createdBy: userId,
        },
      });
    });
    this.audit(tenantId, userId, 'template.version.created', version.id, {
      version: version.version,
      code: TEMPLATE_CODE,
    });
    return version;
  }

  async messages(tenantId: string, query: CommunicationMessagesQueryDto) {
    await this.requireEnabled(tenantId, true);
    const { page, limit, status } = query;
    const where = {
      tenantId,
      entityType: 'INVOICE',
      ...(status ? { status } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.communicationMessage.findMany({
        where,
        select: MESSAGE_SUMMARY,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.communicationMessage.count({ where }),
    ]);
    return { items, total, page, limit };
  }

  async message(tenantId: string, id: string) {
    await this.requireEnabled(tenantId, true);
    const message = await this.prisma.communicationMessage.findFirst({
      where: { id, tenantId, entityType: 'INVOICE' },
      select: { ...MESSAGE_SUMMARY, bodyText: true },
    });
    if (!message) throw new NotFoundException('Mensaje no encontrado');
    await this.invoice(tenantId, message.invoiceId);
    const deliveryAttempts =
      await this.prisma.communicationDeliveryAttempt.findMany({
        where: { tenantId, messageId: id },
        orderBy: { attempt: 'asc' },
      });
    return { ...message, deliveryAttempts };
  }

  async sendInvoice(tenantId: string, userId: string, invoiceId: string) {
    await this.requireEnabled(tenantId, true);
    await this.invoice(tenantId, invoiceId);
    return this.core.queueInvoice(tenantId, invoiceId, userId);
  }

  async retry(tenantId: string, userId: string, id: string) {
    const message = await this.message(tenantId, id);
    await this.invoice(tenantId, message.invoiceId);
    return this.core.retry(tenantId, id, userId);
  }

  async timeline(
    tenantId: string,
    invoiceId: string,
    query: CommunicationPageDto,
  ) {
    await this.requireEnabled(tenantId);
    await this.invoice(tenantId, invoiceId);
    const { page, limit } = query;
    const where = { tenantId, entityType: 'INVOICE', entityId: invoiceId };
    // Merge only ordered ids in SQL; hydrate the requested page using tenant-scoped queries.
    const [ids, messageCount, noteCount] = await Promise.all([
      this.prisma.$queryRaw<Array<{ id: string; kind: 'MESSAGE' | 'NOTE' }>>`
        SELECT id, kind FROM (
          SELECT id, 'MESSAGE' AS kind, created_at FROM communication_messages
          WHERE tenant_id = ${tenantId} AND entity_type = 'INVOICE' AND entity_id = ${invoiceId}
          UNION ALL
          SELECT id, 'NOTE' AS kind, created_at FROM communication_notes
          WHERE tenant_id = ${tenantId} AND entity_type = 'INVOICE' AND entity_id = ${invoiceId}
        ) events ORDER BY created_at DESC, id DESC LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      this.prisma.communicationMessage.count({ where }),
      this.prisma.communicationNote.count({ where }),
    ]);
    const [messages, notes] = await Promise.all([
      this.prisma.communicationMessage.findMany({
        where: {
          ...where,
          id: {
            in: ids
              .filter((row) => row.kind === 'MESSAGE')
              .map((row) => row.id),
          },
        },
        select: MESSAGE_SUMMARY,
      }),
      this.prisma.communicationNote.findMany({
        where: {
          ...where,
          id: {
            in: ids.filter((row) => row.kind === 'NOTE').map((row) => row.id),
          },
        },
      }),
    ]);
    const messageMap = new Map(
      messages.map((message) => [message.id, message]),
    );
    const noteMap = new Map(notes.map((note) => [note.id, note]));
    const items = ids.map((row) => ({
      ...(row.kind === 'MESSAGE'
        ? messageMap.get(row.id)
        : noteMap.get(row.id)),
      kind: row.kind,
    }));
    return { items, total: messageCount + noteCount, page, limit };
  }

  async createNote(
    tenantId: string,
    userId: string,
    invoiceId: string,
    dto: CommunicationNoteDto,
  ) {
    await this.requireEnabled(tenantId);
    await this.invoice(tenantId, invoiceId);
    // Notes are plain text. No HTML rendering or attachment URLs are accepted.
    const note = await this.prisma.communicationNote.create({
      data: {
        tenantId,
        entityType: 'INVOICE',
        entityId: invoiceId,
        body: dto.body.trim(),
        createdBy: userId,
      },
    });
    this.audit(tenantId, userId, 'note.created', note.id, {
      entityType: 'INVOICE',
      entityId: invoiceId,
    });
    return note;
  }

  async notifications(
    tenantId: string,
    userId: string,
    query: CommunicationPageDto,
  ) {
    await this.requireEnabled(tenantId);
    const { page, limit } = query;
    const where = { tenantId, userId };
    const [items, total, unreadCount] = await Promise.all([
      this.prisma.communicationNotification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          messageId: true,
          title: true,
          body: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.communicationNotification.count({ where }),
      this.prisma.communicationNotification.count({
        where: { ...where, readAt: null },
      }),
    ]);
    return { items, total, unreadCount, page, limit };
  }

  async readNotification(tenantId: string, userId: string, id: string) {
    await this.requireEnabled(tenantId);
    const where = { id, tenantId, userId };
    const notification = await this.prisma.communicationNotification.findFirst({
      where,
    });
    if (!notification)
      throw new NotFoundException('Notificación no encontrada');
    if (!notification.readAt)
      await this.prisma.communicationNotification.updateMany({
        where: { ...where, readAt: null },
        data: { readAt: new Date() },
      });
    return this.prisma.communicationNotification.findFirstOrThrow({
      where,
      select: {
        id: true,
        messageId: true,
        title: true,
        body: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  private audit(
    tenantId: string,
    userId: string,
    action: string,
    resourceId: string,
    after?: unknown,
  ) {
    this.events.emit('audit.log', {
      tenantId,
      userId,
      module: 'communications',
      action,
      resourceId,
      ...(after ? { after } : {}),
    });
  }
}
