import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuditLogEvent } from '../audit/audit-log.event';
import { EmailService } from '../email/email.service';
import { ImapConnectionService } from '../integrations/imap-connection.service';
import { IntegrationsService } from '../integrations/integrations.service';
import { ApplicationEmailRepository } from './application-email.repository';
import type { SendApplicationEmailDto } from './dto/send-email.dto';

@Injectable()
export class ApplicationEmailService {
  constructor(
    private readonly repository: ApplicationEmailRepository,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
    private readonly integrationsService: IntegrationsService,
    private readonly imapConnection: ImapConnectionService,
  ) {}

  list(tenantId: string) {
    return this.repository.list(tenantId);
  }

  async listInbox(tenantId: string) {
    const config =
      await this.integrationsService.getEnabledImapConfig(tenantId);
    if (!config) return [];
    return this.repository.listInbox(tenantId, config.user.toLowerCase());
  }

  async syncInbox(tenantId: string) {
    const config =
      await this.integrationsService.getEnabledImapConfig(tenantId);
    if (!config) {
      throw new ServiceUnavailableException(
        'El correo entrante no está configurado o está desactivado',
      );
    }
    try {
      const { uidValidity, messages } = await this.imapConnection.fetchInbox(
        config,
        100,
      );
      await this.repository.syncInboxMessages(
        tenantId,
        config.user.toLowerCase(),
        uidValidity,
        messages,
      );
      return { synced: messages.length, mailbox: config.user };
    } catch {
      throw new BadGatewayException(
        'No se pudo sincronizar el buzón IMAP. Revisá la configuración y volvé a intentar.',
      );
    }
  }

  status(tenantId: string, mailboxAddress: string) {
    return this.emailService.getTenantEmailStatus(tenantId, mailboxAddress);
  }

  async send(tenantId: string, userId: string, dto: SendApplicationEmailDto) {
    const message = await this.repository.createPending(tenantId, userId, {
      recipient: dto.to.trim().toLowerCase(),
      subject: dto.subject.trim(),
      bodyText: dto.body,
    });
    try {
      await this.emailService.sendTenantText({
        tenantId,
        to: message.recipient,
        subject: message.subject,
        text: message.bodyText,
      });
      await this.repository.markSent(tenantId, message.id);
      this.eventEmitter.emit('application.email.sent', {
        tenantId,
        messageId: message.id,
      });
      this.eventEmitter.emit('audit.log', {
        tenantId,
        userId,
        module: 'applications',
        action: 'application.email.sent',
        resourceId: message.id,
        after: { to: message.recipient, subject: message.subject },
      } satisfies AuditLogEvent);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.repository.markFailed(tenantId, message.id, detail);
      throw new BadGatewayException(
        'No se pudo enviar el correo. Revisá la integración SMTP e intentá nuevamente.',
      );
    }
    return this.repository.findById(tenantId, message.id);
  }
}
