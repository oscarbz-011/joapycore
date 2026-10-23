import { LogisticsOnSaleCompletedListener } from './logistics-on-sale-completed.listener';

describe('LogisticsOnSaleCompletedListener', () => {
  const setup = (
    created: boolean,
    logisticsActive = true,
    orderStatus: string | null = 'PAYMENT_RECEIVED',
  ) => {
    const repo = {
      ensurePendingForOrder: jest
        .fn()
        .mockResolvedValue({ id: 'dn-1', created }),
    };
    const events = { emit: jest.fn() };
    const tenantModules = {
      isActive: jest.fn().mockResolvedValue(logisticsActive),
    };
    const sources = {
      findOrderStatus: jest.fn().mockResolvedValue(orderStatus),
    };
    const listener = new LogisticsOnSaleCompletedListener(
      repo as never,
      events as never,
      tenantModules as never,
      sources as never,
    );
    return { listener, repo, events, tenantModules, sources };
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

  it('creates nothing when the tenant does not use Logistics', async () => {
    const { listener, repo, events, tenantModules } = setup(true, false);
    await listener.handle({ tenantId: 't1', saleOrderId: 'o1' });
    expect(tenantModules.isActive).toHaveBeenCalledWith('t1', 'logistics');
    expect(repo.ensurePendingForOrder).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  // El contado cobrado no pasa por "confirmar": sin esto no tenía nota hasta
  // que el backfill del arranque la creaba.
  it('creates the note when a cash sale is collected', async () => {
    const { listener, repo, sources } = setup(true);
    await listener.handlePaymentCollected({
      tenantId: 't1',
      saleOrderId: 'o1',
    });
    expect(sources.findOrderStatus).toHaveBeenCalledWith('t1', 'o1');
    expect(repo.ensurePendingForOrder).toHaveBeenCalledWith('t1', 'o1');
  });

  it('ignores POS sales, which are collected already delivered', async () => {
    const { listener, repo } = setup(true, true, 'DELIVERED');
    await listener.handlePaymentCollected({
      tenantId: 't1',
      saleOrderId: 'o1',
    });
    expect(repo.ensurePendingForOrder).not.toHaveBeenCalled();
  });

  it('ignores a collected sale the tenant cannot see', async () => {
    const { listener, repo } = setup(true, true, null);
    await listener.handlePaymentCollected({
      tenantId: 't1',
      saleOrderId: 'o1',
    });
    expect(repo.ensurePendingForOrder).not.toHaveBeenCalled();
  });
});
