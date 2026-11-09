import { Injectable } from '@nestjs/common';
import { OnDomainEvent } from '../../../common/events/on-domain-event.decorator';
import type { DomainEvents } from '../../../common/events/domain-events';
import { RemissionNotePdfService } from '../services/remission-note-pdf.service';

@Injectable()
export class RemissionNotePdfListener {
  constructor(private readonly pdf: RemissionNotePdfService) {}

  @OnDomainEvent('remission-note.pdf.requested', {
    consumer: 'billing.remission-note-pdf',
    suppressErrors: false,
  })
  async handle(event: DomainEvents['remission-note.pdf.requested']) {
    await this.pdf.generate(
      event.tenantId,
      event.remissionNoteId,
      event.requestedById,
    );
  }
}
