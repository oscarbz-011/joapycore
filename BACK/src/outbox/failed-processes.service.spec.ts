import { documentRefOf } from './failed-processes';
import { FailedProcessesService } from './failed-processes.service';
import { OUTBOX_MAX_ATTEMPTS } from './outbox.service';

const createdAt = new Date('2026-11-20T10:00:00Z');
const failedAt = new Date('2026-11-20T19:00:00Z');

function event(overrides = {}) {
  return {
    id: 'ev-1',
    eventName: 'invoice.issued',
    payload: { tenantId: 't1', invoiceId: 'inv-1', saleOrderId: 'so-1' },
    status: 'FAILED',
    attempts: OUTBOX_MAX_ATTEMPTS,
    lastError: 'payments.receivable-from-invoice: db down',
    createdAt,
    nextAttemptAt: failedAt,
    deliveries: [],
    ...overrides,
  };
}

function setup(events: unknown[]) {
  const repo = { findFailed: jest.fn().mockResolvedValue(events) };
  const outbox = { retry: jest.fn() };
  const service = new FailedProcessesService(repo as never, outbox as never);
  return { service, repo, outbox };
}

describe('FailedProcessesService', () => {
  it('lists one row per failed process with only the affected document', async () => {
    const { service, repo } = setup([
      event({
        deliveries: [
          {
            consumer: 'communications.send-invoice',
            status: 'DONE',
            lastError: 'sin correo',
            updatedAt: failedAt,
          },
          {
            consumer: 'payments.receivable-from-invoice',
            status: 'FAILED',
            lastError: 'db down',
            updatedAt: failedAt,
          },
        ],
      }),
    ]);

    const rows = await service.list('t1');

    expect(repo.findFailed).toHaveBeenCalledWith('t1', OUTBOX_MAX_ATTEMPTS);
    expect(rows).toEqual([
      expect.objectContaining({
        eventId: 'ev-1',
        consumer: 'communications.send-invoice',
        kind: 'NOT_RETRIED',
        error: 'sin correo',
        document: { type: 'invoice', id: 'inv-1' },
      }),
      expect.objectContaining({
        consumer: 'payments.receivable-from-invoice',
        kind: 'STUCK',
        error: 'db down',
      }),
    ]);
    expect(rows[0]).not.toHaveProperty('payload');
  });

  it('shows a stuck event that never reached its consumers', async () => {
    const { service } = setup([event()]);

    await expect(service.list('t1')).resolves.toEqual([
      expect.objectContaining({
        consumer: null,
        kind: 'STUCK',
        error: 'payments.receivable-from-invoice: db down',
        failedAt,
      }),
    ]);
  });

  it('cuts long error messages', async () => {
    const { service } = setup([event({ lastError: 'x'.repeat(2000) })]);
    const [row] = await service.list('t1');
    expect(row.error).toHaveLength(500);
  });

  it('counts the rows of the list', async () => {
    const { service } = setup([event(), event({ id: 'ev-2' })]);
    await expect(service.count('t1')).resolves.toEqual({ count: 2 });
  });

  it('passes the retry to the outbox with the company', async () => {
    const { service, outbox } = setup([]);
    outbox.retry.mockResolvedValue({ resolved: true });

    await expect(service.retry('t1', 'ev-1', 'a')).resolves.toEqual({
      resolved: true,
    });
    expect(outbox.retry).toHaveBeenCalledWith('t1', 'ev-1', 'a');
  });
});

describe('documentRefOf', () => {
  it('prefers the most specific document', () => {
    expect(
      documentRefOf({ saleOrderId: 'so-1', deliveryNoteId: 'dn-1' }),
    ).toEqual({ type: 'delivery-note', id: 'dn-1' });
  });

  it('points a purchase receipt to its order', () => {
    expect(
      documentRefOf({ purchaseOrderId: 'po-1', purchaseReceiptId: 'pr-1' }),
    ).toEqual({ type: 'purchase-order', id: 'po-1' });
  });

  it('has no document for an event without one', () => {
    expect(documentRefOf({ tenantId: 't1' })).toBeNull();
    expect(documentRefOf(null)).toBeNull();
    expect(documentRefOf([])).toBeNull();
  });
});
