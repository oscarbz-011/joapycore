import { Injectable } from '@nestjs/common';
import { EventBus } from '../../../common/events/event-bus';
import { CreditBureauRepository } from '../repositories/credit-bureau.repository';
import { RecordBureauCheckDto } from '../dto/record-bureau-check.dto';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class CreditBureauChecksService {
  constructor(
    private readonly repo: CreditBureauRepository,
    private readonly eventEmitter: EventBus,
  ) {}

  async recordCheck(
    tenantId: string,
    dto: RecordBureauCheckDto,
    userId?: string,
  ) {
    const check = await this.repo.createCheck({
      tenantId,
      customerId: dto.customerId,
      saleOrderId: dto.saleOrderId ?? null,
      performedById: userId ?? null,
      provider: 'manual',
      result: dto.result,
      notes: dto.notes ?? null,
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'credit-bureau',
      action: 'credit-bureau.check.recorded',
      resourceId: check.id,
      after: { customerId: dto.customerId, result: dto.result },
    } satisfies AuditLogEvent);

    return check;
  }

  findByCustomer(tenantId: string, customerId: string) {
    return this.repo.findChecksByCustomer(tenantId, customerId);
  }
}
