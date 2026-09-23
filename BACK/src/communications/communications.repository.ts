import { Injectable } from '@nestjs/common';
import {
  CommunicationMessage,
  CommunicationMessageStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type DeliveryCompletion = {
  status: CommunicationMessageStatus;
  code?: string;
  error?: string;
  availableAt?: Date;
  providerMessageId?: string;
};

@Injectable()
export class CommunicationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  settings(tenantId: string) {
    return this.prisma.communicationSettings.findUnique({
      where: { tenantId },
    });
  }

  activeTenant(tenantId: string) {
    return this.prisma.tenant.findFirst({
      where: {
        id: tenantId,
        status: 'ACTIVE',
        tenantModules: { some: { moduleName: 'billing', active: true } },
      },
      select: { id: true },
    });
  }

  invoice(tenantId: string, invoiceId: string) {
    return this.prisma.invoice.findFirst({
      where: { tenantId, id: invoiceId },
      include: {
        tenant: { select: { name: true, razonSocial: true } },
        saleOrder: { include: { customer: true } },
      },
    });
  }

  actor(tenantId: string, userId: string) {
    return this.prisma.user.findFirst({
      where: { tenantId, id: userId, status: 'ACTIVE' },
      select: { id: true },
    });
  }

  identity(tenantId: string) {
    return this.prisma.communicationIdentity.findFirst({
      where: { tenantId, isDefault: true, outboundEnabled: true },
      orderBy: { id: 'asc' },
    });
  }

  activeIdentity(tenantId: string, identityId: string) {
    return this.prisma.communicationIdentity.findFirst({
      where: { tenantId, id: identityId, outboundEnabled: true },
    });
  }

  template(tenantId: string, code: string) {
    return this.prisma.communicationTemplateVersion.findFirst({
      where: { tenantId, code },
      orderBy: { version: 'desc' },
    });
  }

  byKey(tenantId: string, idempotencyKey: string) {
    return this.prisma.communicationMessage.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } },
    });
  }

  message(tenantId: string, id: string) {
    return this.prisma.communicationMessage.findFirst({
      where: { tenantId, id },
    });
  }

  async createQueued(data: Prisma.CommunicationMessageUncheckedCreateInput) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const message = await tx.communicationMessage.create({ data });
        await this.notify(tx, message, 'QUEUED', 'Correo de factura en cola');
        return message;
      });
    } catch (error) {
      // A competing listener/manual request won the unique invoice key.
      if ((error as { code?: string }).code === 'P2002') {
        const existing = await this.byKey(data.tenantId, data.idempotencyKey);
        if (existing) return existing;
      }
      throw error;
    }
  }

  recordAutomaticFailure(input: {
    tenantId: string;
    invoiceId: string;
    userId: string;
    code: string;
    reason: string;
  }) {
    const idempotencyKey = `invoice:${input.invoiceId}:automatic:${input.userId}:${input.code}`;
    return this.prisma.communicationNotification.upsert({
      where: {
        tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey },
      },
      update: {},
      create: {
        tenantId: input.tenantId,
        userId: input.userId,
        messageId: null,
        idempotencyKey,
        title: 'No se pudo preparar el correo de la factura',
        body: input.reason,
      },
    });
  }

  async retry(tenantId: string, id: string) {
    return this.prisma.communicationMessage.updateMany({
      where: { tenantId, id, status: 'FAILED' },
      data: {
        status: 'QUEUED',
        availableAt: new Date(),
        lockedAt: null,
        lastError: null,
      },
    });
  }

  due(now: Date) {
    return this.prisma.$queryRaw<
      Array<{ id: string; tenantId: string; attempts: number }>
    >`
      SELECT m.id, m.tenant_id AS "tenantId", m.attempts FROM communication_messages m
      JOIN communication_settings s ON s.tenant_id = m.tenant_id
      JOIN tenants t ON t.id = m.tenant_id AND t.status = 'ACTIVE'
      JOIN tenant_modules tm ON tm.tenant_id = m.tenant_id AND tm.module_name = 'billing' AND tm.active = true
      WHERE m.status = 'QUEUED' AND m.available_at <= ${now}
        AND s.enabled = true AND s.email_enabled = true
      ORDER BY m.available_at, m.id LIMIT 100`;
  }

  stale(cutoff: Date) {
    return this.prisma.communicationMessage.findMany({
      where: { status: 'PROCESSING', lockedAt: { lt: cutoff } },
      take: 100,
    });
  }

  async claim(
    tenantId: string,
    id: string,
    now: Date,
  ): Promise<CommunicationMessage | null> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.communicationMessage.updateMany({
        where: { tenantId, id, status: 'QUEUED', availableAt: { lte: now } },
        data: {
          status: 'PROCESSING',
          lockedAt: now,
          attempts: { increment: 1 },
        },
      });
      if (claimed.count !== 1) return null;
      const message = await tx.communicationMessage.findFirstOrThrow({
        where: { tenantId, id },
      });
      await tx.communicationDeliveryAttempt.create({
        data: {
          tenantId,
          messageId: id,
          attempt: message.attempts,
          status: 'PROCESSING',
          startedAt: now,
        },
      });
      return message;
    });
  }

  async finish(
    message: CommunicationMessage,
    result: DeliveryCompletion,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const finishedAt = new Date();
      const changed = await tx.communicationMessage.updateMany({
        where: {
          tenantId: message.tenantId,
          id: message.id,
          status: 'PROCESSING',
          attempts: message.attempts,
        },
        data: {
          status: result.status,
          lockedAt: null,
          lastError: result.error ?? null,
          availableAt: result.availableAt,
          sentAt: result.status === 'SENT' ? finishedAt : undefined,
          providerMessageId: result.providerMessageId,
        },
      });
      if (changed.count !== 1) return false;
      await tx.communicationDeliveryAttempt.updateMany({
        where: {
          tenantId: message.tenantId,
          messageId: message.id,
          attempt: message.attempts,
          status: 'PROCESSING',
        },
        data: {
          status: result.status === 'QUEUED' ? 'FAILED' : result.status,
          errorCode: result.code,
          errorMessage: result.error,
          finishedAt,
        },
      });
      const title =
        result.status === 'SENT'
          ? 'Correo de factura aceptado por SMTP'
          : result.status === 'UNKNOWN'
            ? 'Correo con resultado incierto: requiere revisión'
            : result.status === 'QUEUED'
              ? 'Correo pendiente de reintento'
              : 'No se pudo enviar el correo de factura';
      await this.notify(
        tx,
        message,
        `${result.status}:${message.attempts}`,
        title,
        result.error,
      );
      return true;
    });
  }

  private async notify(
    tx: Prisma.TransactionClient,
    message: CommunicationMessage,
    key: string,
    title: string,
    body?: string,
  ) {
    if (!message.requestedBy) return;
    const idempotencyKey = `message:${message.id}:${key}`;
    await tx.communicationNotification.upsert({
      where: {
        tenantId_idempotencyKey: { tenantId: message.tenantId, idempotencyKey },
      },
      update: {},
      create: {
        tenantId: message.tenantId,
        userId: message.requestedBy,
        messageId: message.id,
        idempotencyKey,
        title,
        body,
      },
    });
  }
}
