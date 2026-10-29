import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEventName, DomainEvents } from './domain-events';

/** EventEmitter2 con el nombre y el payload de cada evento verificados. */
@Injectable()
export class EventBus {
  constructor(private readonly emitter: EventEmitter2) {}

  emit<K extends DomainEventName>(name: K, payload: DomainEvents[K]): boolean {
    return this.emitter.emit(name, payload);
  }

  emitAsync<K extends DomainEventName>(
    name: K,
    payload: DomainEvents[K],
  ): Promise<unknown[]> {
    return this.emitter.emitAsync(name, payload);
  }
}
