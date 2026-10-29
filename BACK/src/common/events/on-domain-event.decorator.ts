import { OnEvent } from '@nestjs/event-emitter';
import type { DomainEventName, DomainEvents } from './domain-events';

type OnEventOptions = NonNullable<Parameters<typeof OnEvent>[1]>;

type Handler<K extends DomainEventName> = (event: DomainEvents[K]) => unknown;

export const DURABLE_CONSUMER = 'joapy:durable-consumer';

export interface DurableConsumerMetadata {
  event: DomainEventName;
  consumer: string;
  /** Si el módulo está apagado para el tenant, el evento se saltea. */
  module?: string;
  /** Con suppressErrors: false un fallo se reintenta; si no, solo se registra. */
  retry: boolean;
}

type DomainEventOptions = Partial<Exclude<OnEventOptions, boolean>> & {
  /**
   * Nombre estable del consumidor de un evento del outbox. Con él, el outbox
   * lo llama y lleva su entrega por separado; sin él, el listener se registra
   * en el emisor en memoria.
   */
  consumer?: string;
  module?: string;
};

/** `@OnEvent` que exige un evento del catálogo y un handler que acepte su payload. */
export function OnDomainEvent<K extends DomainEventName>(
  name: K,
  options: DomainEventOptions = {},
) {
  const { consumer, module, ...eventOptions } = options;
  return (
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<Handler<K>>,
  ) => {
    if (consumer) {
      // Un mismo método puede consumir varios eventos.
      const handler = descriptor.value as object;
      const previous = (Reflect.getMetadata(DURABLE_CONSUMER, handler) ??
        []) as DurableConsumerMetadata[];
      Reflect.defineMetadata(
        DURABLE_CONSUMER,
        [
          ...previous,
          {
            event: name,
            consumer,
            module,
            retry: eventOptions.suppressErrors === false,
          },
        ],
        handler,
      );
      return;
    }
    OnEvent(name, eventOptions)(target, key, descriptor);
  };
}
