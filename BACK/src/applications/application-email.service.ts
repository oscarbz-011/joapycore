import { BadGatewayException, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { AuditLogEvent } from '../audit/audit-log.event';
import { EmailService } from '../email/email.service';
import { ApplicationEmailRepository } from './application-email.repository';
import type { SendApplicationEmailDto } from './dto/send-email.dto';

@Injectable()
export class ApplicationEmailService {
  constructor(
    private readonly repository: ApplicationEmailRepository,
    private readonly emailService: EmailService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  list(tenantId: string) {
    return this.repository.list(tenantId);
  }

  async status(tenantId: string) {
    return { enabled: await this.emailService.isTenantEmailEnabled(tenantId) };
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
