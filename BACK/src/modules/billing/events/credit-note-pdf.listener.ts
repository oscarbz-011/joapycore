import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import type { DomainEvents } from '../../../common/events/domain-events';
import { CreditNotePdfService } from '../services/credit-note-pdf.service';

@Injectable()
export class CreditNotePdfListener {
  constructor(private readonly pdf: CreditNotePdfService) {}

  @OnDomainEvent('credit-note.pdf.requested', {
    consumer: 'billing.credit-note-pdf',
    suppressErrors: false,
  })
  async handle(event: DomainEvents['credit-note.pdf.requested']) {
    await this.pdf.generate(
      event.tenantId,
      event.creditNoteId,
      event.requestedById,
    );
  }
}
