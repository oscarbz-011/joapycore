import { Injectable, Logger } from '@nestjs/common';
import { OnDomainEvent } from '../common/events/on-domain-event.decorator';
import { AuditRepository } from './audit.repository';
import type { AuditLogEvent } from './audit-log.event';

@Injectable()
export class AuditListener {
  private readonly logger = new Logger(AuditListener.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  @OnDomainEvent('audit.log', { async: true })
  async handle(event: AuditLogEvent) {
    try {
      await this.auditRepository.create(event);
    } catch (err) {
      this.logger.error('Failed to persist audit log', err);
    }
  }
}
