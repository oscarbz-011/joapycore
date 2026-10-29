import { Injectable, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner, Reflector } from '@nestjs/core';
import {
  DURABLE_CONSUMER,
  type DurableConsumerMetadata,
} from '../common/events/on-domain-event.decorator';

export interface OutboxConsumer extends DurableConsumerMetadata {
  handle: (payload: unknown) => unknown;
}

/** Los métodos marcados con `@OnDomainEvent(…, { consumer })`, por evento. */
@Injectable()
export class OutboxConsumersRegistry implements OnModuleInit {
  private readonly byEvent = new Map<string, OutboxConsumer[]>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
    private readonly reflector: Reflector,
  ) {}

  onModuleInit() {
    const seen = new Set<string>();
    for (const wrapper of this.discovery.getProviders()) {
      // Los providers por request no tienen una instancia que llamar.
      if (!wrapper.isDependencyTreeStatic()) continue;
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (!instance || typeof instance !== 'object') continue;
      const prototype = Object.getPrototypeOf(instance) as object;
      for (const name of this.scanner.getAllMethodNames(prototype)) {
        const method = instance[name];
        if (typeof method !== 'function') continue;
        const metas =
          this.reflector.get<DurableConsumerMetadata[] | undefined>(
            DURABLE_CONSUMER,
            method,
          ) ?? [];
        for (const meta of metas) {
          if (seen.has(meta.consumer)) {
            throw new Error(`Consumidor de outbox repetido: ${meta.consumer}`);
          }
          seen.add(meta.consumer);
          this.register({
            ...meta,
            handle: (payload: unknown): unknown =>
              Reflect.apply(method, instance, [payload]) as unknown,
          });
        }
      }
    }
  }

  register(consumer: OutboxConsumer) {
    const list = this.byEvent.get(consumer.event) ?? [];
    list.push(consumer);
    this.byEvent.set(consumer.event, list);
  }

  consumersOf(eventName: string): readonly OutboxConsumer[] {
    return this.byEvent.get(eventName) ?? [];
  }
}
