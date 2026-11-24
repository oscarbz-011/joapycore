import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import type {
  DomainEventName,
  DomainEvents,
} from '../common/events/domain-events';
import { TenantModulesCache } from '../tenants/services/tenant-modules.cache';
import {
  OutboxConsumersRegistry,
  type OutboxConsumer,
} from './outbox-consumers.registry';
import { OutboxRepository } from './outbox.repository';
import { TenantContext } from '../prisma/tenant-context';

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
 * El evento queda guardado en la misma transacción que lo origina. Cada
 * consumidor (`@OnDomainEvent(…, { consumer })`) se llama por separado y su
 * resultado queda en outbox_deliveries: si uno falla, el reintento con
 * backoff solo vuelve a llamar a ese. La entrega es "al menos una vez": los
 * consumidores tienen que ser idempotentes, y solo se reintentan los que
 * declaran `suppressErrors: false`.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly outboxRepository: OutboxRepository,
    private readonly eventEmitter: EventEmitter2,
    private readonly consumers: OutboxConsumersRegistry,
    private readonly tenantModules: TenantModulesCache,
  ) {}

  async enqueue<K extends DomainEventName>(
    client: Prisma.TransactionClient,
    tenantId: string,
    eventName: K,
    payload: DomainEvents[K],
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

  /**
   * Despacha un evento. Nunca lanza: quien lo llama ya guardó su transacción,
   * y un fallo queda programado para reintento o lo retoma el cron.
   */
  async dispatch(id: string): Promise<boolean> {
    try {
      return await this.dispatchOnce(id);
    } catch (error) {
      this.logger.error(
        `No se pudo despachar el evento ${id}; lo retoma el cron: ${(error as Error).message}`,
      );
      return false;
    }
  }

  private async dispatchOnce(id: string): Promise<boolean> {
    const now = new Date();
    if (!(await this.outboxRepository.claim(id, now))) return false;
    const event = await this.outboxRepository.findById(id);
    if (!event) return false;

    const delivered = new Set(
      await this.outboxRepository.findDeliveredConsumers(id),
    );
    const pending = this.consumers
      .consumersOf(event.eventName)
      .filter((c) => !delivered.has(c.consumer));
    const outcomes = await Promise.all(
      pending.map((consumer) =>
        this.deliver(id, event.tenantId, consumer, event.payload),
      ),
    );
    const failures = outcomes.filter((o): o is string => o !== null);

    // Observadores en memoria, como el puente a WebSocket. Un fallo acá no
    // puede cortar el despacho ni el lote del cron.
    try {
      this.eventEmitter.emit(event.eventName, event.payload);
    } catch (error) {
      this.logger.warn(
        `No se pudo avisar en memoria el evento ${id}: ${(error as Error).message}`,
      );
    }

    if (failures.length === 0) {
      await this.outboxRepository.markDone(id);
      return true;
    }
    const message = failures.join('; ');
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

  /**
   * Reintento pedido por un administrador. Un evento trabado tiene un intento
   * más con todos sus consumidores pendientes; un consumidor que falló sin
   * reintento se vuelve a llamar solo a él. Devuelve si quedó resuelto.
   */
  async retry(
    tenantId: string,
    eventId: string,
    consumerName: string | null,
  ): Promise<{ resolved: boolean }> {
    const event = await this.outboxRepository.findForRetry(tenantId, eventId);
    if (!event) throw new NotFoundException('Proceso no encontrado');

    if (event.status === 'FAILED' && event.attempts >= OUTBOX_MAX_ATTEMPTS) {
      await this.outboxRepository.reopenStuck(
        tenantId,
        eventId,
        OUTBOX_MAX_ATTEMPTS,
      );
      return { resolved: await this.dispatch(eventId) };
    }

    const delivery = consumerName
      ? await this.outboxRepository.findDelivery(
          tenantId,
          eventId,
          consumerName,
        )
      : null;
    if (delivery?.status !== 'DONE' || delivery.lastError === null) {
      throw new ConflictException('Este proceso ya no tiene errores');
    }
    const consumer = this.consumers
      .consumersOf(event.eventName)
      .find((c) => c.consumer === consumerName);
    if (!consumer) {
      throw new UnprocessableEntityException(
        'Este proceso ya no existe en el sistema',
      );
    }
    await this.deliver(eventId, tenantId, consumer, event.payload);
    const after = await this.outboxRepository.findDelivery(
      tenantId,
      eventId,
      consumer.consumer,
    );
    return { resolved: after?.lastError === null };
  }

  /** Devuelve el error si el consumidor falló y hay que reintentarlo. */
  private deliver(
    eventId: string,
    tenantId: string,
    consumer: OutboxConsumer,
    payload: unknown,
  ): Promise<string | null> {
    return TenantContext.run(tenantId, () =>
      this.deliverAsTenant(eventId, tenantId, consumer, payload),
    );
  }

  private async deliverAsTenant(
    eventId: string,
    tenantId: string,
    consumer: OutboxConsumer,
    payload: unknown,
  ): Promise<string | null> {
    try {
      const skip =
        consumer.module &&
        !(await this.tenantModules.isActive(tenantId, consumer.module));
      if (!skip) await consumer.handle(payload);
      await this.outboxRepository.recordDelivery(
        tenantId,
        eventId,
        consumer.consumer,
        {
          failed: false,
        },
      );
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      try {
        await this.outboxRepository.recordDelivery(
          tenantId,
          eventId,
          consumer.consumer,
          {
            failed: consumer.retry,
            error: message,
          },
        );
      } catch (recordError) {
        // Sin el registro no se sabe si se procesó: se reintenta.
        return `${consumer.consumer}: ${message} (sin registrar: ${(recordError as Error).message})`;
      }
      if (consumer.retry) return `${consumer.consumer}: ${message}`;
      this.logger.warn(
        `${consumer.consumer} no procesó el evento ${eventId} (sin reintento): ${message}`,
      );
      return null;
    }
  }

  @Cron(CronExpression.EVERY_30_SECONDS)
  processDue(): Promise<void> {
    return TenantContext.runAsPlatform(() => this.processDueAsPlatform());
  }

  private async processDueAsPlatform(): Promise<void> {
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
  purgeDone(): Promise<void> {
    return TenantContext.runAsPlatform(() => this.purgeDoneAsPlatform());
  }

  private async purgeDoneAsPlatform(): Promise<void> {
    const cutoff = new Date(Date.now() - DONE_RETENTION_DAYS * 86_400_000);
    const { count } = await this.outboxRepository.deleteDoneBefore(cutoff);
    if (count > 0) this.logger.log(`Purged ${count} processed outbox event(s)`);
  }
}
