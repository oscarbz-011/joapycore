import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { AuditRepository } from './audit.repository';
import type { AuditLogEvent } from './audit-log.event';

@Injectable()
export class AuditListener {
  private readonly logger = new Logger(AuditListener.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  @OnEvent('audit.log', { async: true })
  async handle(event: AuditLogEvent) {
    try {
      await this.auditRepository.create(event);
    } catch (err) {
      this.logger.error('Failed to persist audit log', err);
    }
  }
}
