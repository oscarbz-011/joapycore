import { OutboxConsumersRegistry } from './outbox-consumers.registry';
import type { OutboxConsumer } from './outbox-consumers.registry';
import {
  backoffMs,
  OUTBOX_MAX_ATTEMPTS,
  OutboxService,
} from './outbox.service';

const PAYLOAD = { tenantId: 't1', invoiceId: 'i1' };

function consumer(
  name: string,
  overrides: Partial<OutboxConsumer> = {},
): OutboxConsumer {
  return {
    event: 'invoice.issued',
    consumer: name,
    retry: true,
    handle: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function setup(consumers: OutboxConsumer[] = [consumer('a'), consumer('b')]) {
  const repo = {
    create: jest.fn().mockResolvedValue({ id: 'ev-1' }),
    claim: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockResolvedValue({
      id: 'ev-1',
      tenantId: 't1',
      eventName: 'invoice.issued',
      payload: PAYLOAD,
      attempts: 1,
    }),
    findDeliveredConsumers: jest.fn().mockResolvedValue([]),
    recordDelivery: jest.fn().mockResolvedValue(undefined),
    markDone: jest.fn(),
    markFailed: jest.fn(),
    findDue: jest.fn().mockResolvedValue([]),
    deleteDoneBefore: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const events = { emit: jest.fn() };
  const registry = new OutboxConsumersRegistry(
    {} as never,
    {} as never,
    {} as never,
  );
  consumers.forEach((c) => registry.register(c));
  const tenantModules = { isActive: jest.fn().mockResolvedValue(true) };
  const service = new OutboxService(
    repo as never,
    events as never,
    registry,
    tenantModules as never,
  );
  jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  return { service, repo, events, tenantModules, consumers };
}

describe('OutboxService', () => {
  it('stores the payload as plain JSON inside the caller transaction', async () => {
    const { service, repo } = setup();
    const tx = {};
    const when = new Date('2026-09-13T12:00:00Z');

    // La fecha prueba la ida y vuelta por JSON, aunque el evento no la lleve.
    await service.enqueue(tx as never, 't1', 'sale.order.completed', {
      saleOrderId: 'o1',
      when,
    } as never);

    expect(repo.create).toHaveBeenCalledWith(
      {
        tenantId: 't1',
        eventName: 'sale.order.completed',
        payload: { saleOrderId: 'o1', when: '2026-09-13T12:00:00.000Z' },
      },
      tx,
    );
  });

  it('delivers to every consumer, records each one and marks the event done', async () => {
    const { service, repo, events, consumers } = setup();

    await expect(service.dispatch('ev-1')).resolves.toBe(true);

    for (const c of consumers) {
      expect(c.handle).toHaveBeenCalledWith(PAYLOAD);
      expect(repo.recordDelivery).toHaveBeenCalledWith('ev-1', c.consumer, {
        failed: false,
      });
    }
    expect(events.emit).toHaveBeenCalledWith('invoice.issued', PAYLOAD);
    expect(repo.markDone).toHaveBeenCalledWith('ev-1');
  });

  it('does not deliver when another process already claimed the event', async () => {
    const { service, repo, consumers } = setup();
    repo.claim.mockResolvedValue(false);

    await expect(service.dispatch('ev-1')).resolves.toBe(false);
    expect(consumers[0].handle).not.toHaveBeenCalled();
  });

  it('schedules a retry when a consumer fails, without blocking the others', async () => {
    const failing = consumer('a', {
      handle: jest.fn().mockRejectedValue(new Error('db down')),
    });
    const healthy = consumer('b');
    const { service, repo } = setup([failing, healthy]);
    repo.findById.mockResolvedValue({
      id: 'ev-1',
      tenantId: 't1',
      eventName: 'invoice.issued',
      payload: PAYLOAD,
      attempts: 3,
    });

    await expect(service.dispatch('ev-1')).resolves.toBe(false);

    expect(healthy.handle).toHaveBeenCalled();
    expect(repo.recordDelivery).toHaveBeenCalledWith('ev-1', 'a', {
      failed: true,
      error: 'db down',
    });
    expect(repo.recordDelivery).toHaveBeenCalledWith('ev-1', 'b', {
      failed: false,
    });
    expect(repo.markDone).not.toHaveBeenCalled();
    const [, message, next] = repo.markFailed.mock.calls[0] as [
      string,
      string,
      Date,
    ];
    expect(message).toBe('a: db down');
    const delay = next.getTime() - Date.now();
    expect(delay).toBeGreaterThan(backoffMs(3) - 2000);
    expect(delay).toBeLessThanOrEqual(backoffMs(3));
  });

  it('only calls again the consumers that have not processed the event yet', async () => {
    const { service, repo, consumers } = setup();
    repo.findDeliveredConsumers.mockResolvedValue(['a']);

    await expect(service.dispatch('ev-1')).resolves.toBe(true);

    expect(consumers[0].handle).not.toHaveBeenCalled();
    expect(consumers[1].handle).toHaveBeenCalled();
  });

  it('records a failure it does not retry and still completes the event', async () => {
    const bestEffort = consumer('a', {
      retry: false,
      handle: jest.fn().mockRejectedValue(new Error('pdf down')),
    });
    const { service, repo } = setup([bestEffort]);

    await expect(service.dispatch('ev-1')).resolves.toBe(true);

    expect(repo.recordDelivery).toHaveBeenCalledWith('ev-1', 'a', {
      failed: false,
      error: 'pdf down',
    });
    expect(repo.markDone).toHaveBeenCalledWith('ev-1');
  });

  it('skips a consumer whose module is off for the tenant', async () => {
    const logistics = consumer('logistics.note', { module: 'logistics' });
    const { service, repo, tenantModules } = setup([logistics]);
    tenantModules.isActive.mockResolvedValue(false);

    await expect(service.dispatch('ev-1')).resolves.toBe(true);

    expect(tenantModules.isActive).toHaveBeenCalledWith('t1', 'logistics');
    expect(logistics.handle).not.toHaveBeenCalled();
    expect(repo.recordDelivery).toHaveBeenCalledWith('ev-1', 'logistics.note', {
      failed: false,
    });
  });

  it('completes the event even if an in-memory observer throws', async () => {
    const { service, repo, events } = setup();
    events.emit.mockImplementation(() => {
      throw new Error('socket caído');
    });

    await expect(service.dispatch('ev-1')).resolves.toBe(true);
    expect(repo.markDone).toHaveBeenCalledWith('ev-1');
  });

  it('retries a consumer whose failure could not be recorded', async () => {
    const failing = consumer('a', {
      retry: false,
      handle: jest.fn().mockRejectedValue(new Error('pdf down')),
    });
    const { service, repo } = setup([failing]);
    repo.recordDelivery.mockRejectedValue(new Error('db down'));

    await expect(service.dispatch('ev-1')).resolves.toBe(false);
    expect(repo.markFailed).toHaveBeenCalled();
  });

  it('calls every consumer of an event stored before the deliveries existed', async () => {
    const { service, repo, consumers } = setup();
    repo.findDeliveredConsumers.mockResolvedValue([]);

    await service.dispatch('ev-1');

    expect(
      consumers.every((c) => (c.handle as jest.Mock).mock.calls.length === 1),
    ).toBe(true);
  });

  it('processes every due event', async () => {
    const { service, repo } = setup();
    repo.findDue.mockResolvedValue(['a', 'b']);
    const dispatch = jest.spyOn(service, 'dispatch').mockResolvedValue(true);
    await service.processDue();
    expect(repo.findDue).toHaveBeenCalledWith(
      expect.any(Date),
      OUTBOX_MAX_ATTEMPTS,
      expect.any(Date),
    );
    expect(dispatch.mock.calls.map((c) => c[0])).toEqual(['a', 'b']);
  });

  it('grows the backoff exponentially up to one hour', () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(2)).toBe(60_000);
    expect(backoffMs(20)).toBe(60 * 60_000);
  });
});
