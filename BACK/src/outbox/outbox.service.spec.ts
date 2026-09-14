import {
  backoffMs,
  OUTBOX_MAX_ATTEMPTS,
  OutboxService,
} from './outbox.service';

function setup() {
  const repo = {
    create: jest.fn().mockResolvedValue({ id: 'ev-1' }),
    claim: jest.fn().mockResolvedValue(true),
    findById: jest.fn().mockResolvedValue({
      id: 'ev-1',
      eventName: 'invoice.issued',
      payload: { tenantId: 't1', invoiceId: 'i1' },
      attempts: 1,
    }),
    markDone: jest.fn(),
    markFailed: jest.fn(),
    findDue: jest.fn().mockResolvedValue([]),
    deleteDoneBefore: jest.fn().mockResolvedValue({ count: 0 }),
  };
  const events = { emitAsync: jest.fn().mockResolvedValue([]) };
  const service = new OutboxService(repo as never, events as never);
  jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined);
  return { service, repo, events };
}

describe('OutboxService', () => {
  it('stores the payload as plain JSON inside the caller transaction', async () => {
    const { service, repo } = setup();
    const tx = {};
    const when = new Date('2026-09-13T12:00:00Z');

    await service.enqueue(tx as never, 't1', 'sale.order.completed', {
      saleOrderId: 'o1',
      when,
    });

    expect(repo.create).toHaveBeenCalledWith(
      {
        tenantId: 't1',
        eventName: 'sale.order.completed',
        payload: { saleOrderId: 'o1', when: '2026-09-13T12:00:00.000Z' },
      },
      tx,
    );
  });

  it('emits and marks the event done', async () => {
    const { service, repo, events } = setup();
    await expect(service.dispatch('ev-1')).resolves.toBe(true);
    expect(events.emitAsync).toHaveBeenCalledWith('invoice.issued', {
      tenantId: 't1',
      invoiceId: 'i1',
    });
    expect(repo.markDone).toHaveBeenCalledWith('ev-1');
  });

  it('does not emit when another process already claimed the event', async () => {
    const { service, repo, events } = setup();
    repo.claim.mockResolvedValue(false);
    await expect(service.dispatch('ev-1')).resolves.toBe(false);
    expect(events.emitAsync).not.toHaveBeenCalled();
  });

  it('schedules a retry with backoff when a listener fails, without throwing', async () => {
    const { service, repo, events } = setup();
    events.emitAsync.mockRejectedValue(new Error('db down'));
    repo.findById.mockResolvedValue({
      id: 'ev-1',
      eventName: 'invoice.issued',
      payload: {},
      attempts: 3,
    });

    await expect(service.dispatch('ev-1')).resolves.toBe(false);

    expect(repo.markDone).not.toHaveBeenCalled();
    const [, message, next] = repo.markFailed.mock.calls[0] as [
      string,
      string,
      Date,
    ];
    expect(message).toBe('db down');
    const delay = next.getTime() - Date.now();
    expect(delay).toBeGreaterThan(backoffMs(3) - 2000);
    expect(delay).toBeLessThanOrEqual(backoffMs(3));
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
