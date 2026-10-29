import { EventEmitter2 } from '@nestjs/event-emitter';
import type { DomainEventName } from '../../src/common/events/domain-events';
import { OutboxConsumersRegistry } from '../../src/outbox/outbox-consumers.registry';
import { OutboxRepository } from '../../src/outbox/outbox.repository';
import { OutboxService } from '../../src/outbox/outbox.service';
import type { PrismaService } from '../../src/prisma/prisma.service';
import { TenantModulesRepository } from '../../src/tenants/repositories/tenant-modules.repository';
import { TenantModulesCache } from '../../src/tenants/services/tenant-modules.cache';

/** El outbox real con un registro de consumidores que cada test completa. */
export function createOutbox(
  prisma: PrismaService,
  events = new EventEmitter2(),
) {
  const registry = new OutboxConsumersRegistry(
    {} as never,
    {} as never,
    {} as never,
  );
  const outbox = new OutboxService(
    new OutboxRepository(prisma),
    events,
    registry,
    new TenantModulesCache(new TenantModulesRepository(prisma)),
  );
  const consume = (
    event: DomainEventName,
    consumer: string,
    handle: (payload: never) => unknown,
    options: { retry?: boolean; module?: string } = {},
  ) =>
    registry.register({
      event,
      consumer,
      retry: options.retry ?? true,
      module: options.module,
      handle: handle,
    });
  return { outbox, registry, consume, events };
}
