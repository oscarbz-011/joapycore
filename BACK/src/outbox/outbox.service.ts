import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { OutboxRepository } from './outbox.repository';

export const OUTBOX_MAX_ATTEMPTS = 10;
const BASE_BACKOFF_MS = 30_000;
const MAX_BACKOFF_MS = 60 * 60_000;
// Un PROCESSING más viejo que esto se considera interrumpido (reinicio, crash).
const STUCK_AFTER_MS = 10 * 60_000;
const DONE_RETENTION_DAYS = 7;

export function backoffMs(attempts: number): number {
  return Math.min(
    BASE_BACKOFF_MS * 2 ** Math.max(attempts - 1, 0),
    MAX_BACKOFF_MS,
  );
}

/**
 * Entrega confiable de eventos críticos entre módulos.
 *
 * Con emit() en memoria, si el listener fallaba después de que la transacción
 * de origen se confirmó (p.ej. crear la cuenta por cobrar de una factura
 * emitida), el error solo quedaba en el log y los datos inconsistentes.
 *
 * Uso:
 *   const eventId = await outbox.enqueue(tx, tenantId, 'invoice.issued', payload);
 *   // …commit…
 *   await outbox.dispatch(eventId);   // o void outbox.dispatch(eventId)
 *
 * El evento queda guardado en la misma transacción que lo origina. Se despacha
 * con emitAsync; si algún listener lanza, se reintenta con backoff exponencial
 * desde el cron. La entrega es "al menos una vez": los listeners de estos
 * eventos tienen que ser idempotentes y declarar `suppressErrors: false` para
 * que el fallo llegue hasta acá.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async enqueue(
    client: Prisma.TransactionClient,
    tenantId: string,
    eventName: string,
    payload: object,
  ): Promise<string> {
    // Ida y vuelta por JSON: el payload que reciben los listeners es el mismo
    // en el primer intento y en los reintentos (fechas y decimales como texto).
    const json = JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
    const row = await this.outboxRepository.create(
      { tenantId, eventName, payload: json },
      client,
    );
    return row.id;
  }

  /** Despacha un evento. Nunca lanza: un fallo queda programado para reintento. */
  async dispatch(id: string): Promise<boolean> {
    const now = new Date();
    if (!(await this.outboxRepository.claim(id, now))) return false;
    const event = await this.outboxRepository.findById(id);
    if (!event) return false;

    try {
      await this.eventEmitter.emitAsync(event.eventName, event.payload);
      await this.outboxRepository.markDone(id);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const exhausted = event.attempts >= OUTBOX_MAX_ATTEMPTS;
      this.logger.error(
        `Evento ${event.eventName} (${id}) falló en el intento ${event.attempts}${
          exhausted ? ' — sin más reintentos, requiere revisión' : ''
        }: ${message}`,
      );
      await this.outboxRepository.markFailed(
        id,
        message,
        new Date(now.getTime() + backoffMs(event.attempts)),
      );
      return false;
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  async processDue(): Promise<void> {
    const now = new Date();
    const ids = await this.outboxRepository.findDue(
      now,
      OUTBOX_MAX_ATTEMPTS,
      new Date(now.getTime() - STUCK_AFTER_MS),
    );
    for (const id of ids) {
      await this.dispatch(id);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async purgeDone(): Promise<void> {
    const cutoff = new Date(Date.now() - DONE_RETENTION_DAYS * 86_400_000);
    const { count } = await this.outboxRepository.deleteDoneBefore(cutoff);
    if (count > 0) this.logger.log(`Purged ${count} processed outbox event(s)`);
  }
}
