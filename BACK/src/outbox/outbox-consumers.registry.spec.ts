import { MetadataScanner, Reflector } from '@nestjs/core';
import { OnDomainEvent } from '../common/events/on-domain-event.decorator';
import type { DomainEvents } from '../common/events/domain-events';
import { OutboxConsumersRegistry } from './outbox-consumers.registry';

type Order = DomainEvents['sale.order.completed'];

class Billing {
  seen: Order[] = [];

  @OnDomainEvent('sale.order.completed', {
    consumer: 'billing.from-order',
    suppressErrors: false,
  })
  @OnDomainEvent('sale.payment.collected', { consumer: 'billing.from-payment' })
  handle(event: Order) {
    this.seen.push(event);
  }
}

class Duplicate {
  @OnDomainEvent('sale.order.completed', { consumer: 'billing.from-order' })
  handle() {}
}

const wrapper = (instance: object, isStatic = true) => ({
  instance,
  isDependencyTreeStatic: () => isStatic,
});

function registryFor(...wrappers: ReturnType<typeof wrapper>[]) {
  const registry = new OutboxConsumersRegistry(
    { getProviders: () => wrappers } as never,
    new MetadataScanner(),
    new Reflector(),
  );
  registry.onModuleInit();
  return registry;
}

describe('OutboxConsumersRegistry', () => {
  it('registers one method that consumes several events', async () => {
    const billing = new Billing();
    const registry = registryFor(wrapper(billing));

    const [fromOrder] = registry.consumersOf('sale.order.completed');
    const [fromPayment] = registry.consumersOf('sale.payment.collected');
    expect(fromOrder).toMatchObject({
      consumer: 'billing.from-order',
      retry: true,
    });
    expect(fromPayment).toMatchObject({
      consumer: 'billing.from-payment',
      retry: false,
    });

    await fromOrder.handle({ tenantId: 't1', saleOrderId: 'o1' });
    expect(billing.seen).toEqual([{ tenantId: 't1', saleOrderId: 'o1' }]);
  });

  it('refuses two consumers with the same name', () => {
    expect(() =>
      registryFor(wrapper(new Billing()), wrapper(new Duplicate())),
    ).toThrow('Consumidor de outbox repetido: billing.from-order');
  });

  it('ignores providers created per request', () => {
    const registry = registryFor(wrapper(new Billing(), false));
    expect(registry.consumersOf('sale.order.completed')).toEqual([]);
  });
});
