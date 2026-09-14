import { LogisticsOnSaleCompletedListener } from './logistics-on-sale-completed.listener';

describe('LogisticsOnSaleCompletedListener', () => {
  const setup = (created: boolean) => {
    const repo = {
      ensurePendingForOrder: jest
        .fn()
        .mockResolvedValue({ id: 'dn-1', created }),
    };
    const events = { emit: jest.fn() };
    const listener = new LogisticsOnSaleCompletedListener(
      repo as never,
      events as never,
    );
    return { listener, repo, events };
  };

  it('creates the pending delivery note and announces it', async () => {
    const { listener, repo, events } = setup(true);
    await listener.handle({ tenantId: 't1', saleOrderId: 'o1' });
    expect(repo.ensurePendingForOrder).toHaveBeenCalledWith('t1', 'o1');
    expect(events.emit).toHaveBeenCalledWith('delivery.note.created', {
      tenantId: 't1',
      saleOrderId: 'o1',
      deliveryNoteId: 'dn-1',
    });
  });

  it('does not re-announce when the order already had a note', async () => {
    const { listener, events } = setup(false);
    await listener.handle({ tenantId: 't1', saleOrderId: 'o1' });
    expect(events.emit).not.toHaveBeenCalled();
  });
});
