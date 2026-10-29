import { OnEvent } from '@nestjs/event-emitter';
import type { DomainEventName, DomainEvents } from './domain-events';

type OnEventOptions = Parameters<typeof OnEvent>[1];

type Handler<K extends DomainEventName> = (event: DomainEvents[K]) => unknown;

/** `@OnEvent` que exige un evento del catálogo y un handler que acepte su payload. */
export function OnDomainEvent<K extends DomainEventName>(
  name: K,
  options?: OnEventOptions,
) {
  return (
    target: object,
    key: string | symbol,
    descriptor: TypedPropertyDescriptor<Handler<K>>,
  ) => {
    OnEvent(name, options)(target, key, descriptor);
  };
}
