import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InvoicesRepository } from '../repositories/invoices.repository';
import type { AuditLogEvent } from '../../../audit/audit-log.event';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly invoicesRepository: InvoicesRepository,
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

  async cancel(tenantId: string, id: string, userId?: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status === 'CANCELLED') {
      throw new UnprocessableEntityException('Invoice is already cancelled');
    }
    if (invoice.status === 'PAID') {
      throw new UnprocessableEntityException(
        'Paid invoices cannot be cancelled. Issue a credit note instead.',
      );
    }
    await this.invoicesRepository.updateStatus(tenantId, id, 'CANCELLED');
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
