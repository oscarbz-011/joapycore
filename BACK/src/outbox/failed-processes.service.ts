import { Injectable } from '@nestjs/common';
import { OutboxRepository } from './outbox.repository';
import { OUTBOX_MAX_ATTEMPTS, OutboxService } from './outbox.service';
import { documentRefOf, type DocumentType } from './failed-processes';

export type FailedProcessKind = 'STUCK' | 'NOT_RETRIED';

export interface FailedProcess {
  eventId: string;
  eventName: string;
  /** Null: el evento falló antes de llegar a sus consumidores. */
  consumer: string | null;
  kind: FailedProcessKind;
  error: string | null;
  attempts: number;
  occurredAt: Date;
  failedAt: Date;
  document: { type: DocumentType; id: string } | null;
}

const ERROR_MAX_LENGTH = 500;

@Injectable()
export class FailedProcessesService {
  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly outbox: OutboxService,
  ) {}

  async list(tenantId: string): Promise<FailedProcess[]> {
    const events = await this.outboxRepository.findFailed(
      tenantId,
      OUTBOX_MAX_ATTEMPTS,
    );
    return events.flatMap((event): FailedProcess[] => {
      const base = {
        eventId: event.id,
        eventName: event.eventName,
        occurredAt: event.createdAt,
        attempts: event.attempts,
        document: documentRefOf(event.payload),
      };
      // Sin entregas registradas: falló antes de llegar a los consumidores.
      if (!event.deliveries.length) {
        return [
          {
            ...base,
            consumer: null,
            kind: 'STUCK',
            error: event.lastError?.slice(0, ERROR_MAX_LENGTH) ?? null,
            failedAt: event.nextAttemptAt,
          },
        ];
      }
      return event.deliveries.map((delivery) => ({
        ...base,
        consumer: delivery.consumer,
        kind: delivery.status === 'FAILED' ? 'STUCK' : 'NOT_RETRIED',
        error: delivery.lastError?.slice(0, ERROR_MAX_LENGTH) ?? null,
        failedAt: delivery.updatedAt,
      }));
    });
  }

  async count(tenantId: string) {
    return { count: (await this.list(tenantId)).length };
  }

  retry(tenantId: string, eventId: string, consumer: string | null) {
    return this.outbox.retry(tenantId, eventId, consumer);
  }
}
