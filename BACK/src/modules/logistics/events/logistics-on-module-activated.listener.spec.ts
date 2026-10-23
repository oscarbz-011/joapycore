import { LogisticsOnModuleActivatedListener } from './logistics-on-module-activated.listener';

describe('LogisticsOnModuleActivatedListener', () => {
  const setup = () => {
    const deliveryNotes = {
      syncWithSales: jest.fn().mockResolvedValue({ closed: 0, created: 0 }),
    };
    const listener = new LogisticsOnModuleActivatedListener(
      deliveryNotes as never,
    );
    return { listener, deliveryNotes };
  };

  it('brings Logistics up to date when it is activated', async () => {
    const { listener, deliveryNotes } = setup();
    await listener.handle({ tenantId: 't1', moduleName: 'logistics' });
    expect(deliveryNotes.syncWithSales).toHaveBeenCalledWith('t1');
  });

  it('ignores other modules', async () => {
    const { listener, deliveryNotes } = setup();
    await listener.handle({ tenantId: 't1', moduleName: 'sales' });
    expect(deliveryNotes.syncWithSales).not.toHaveBeenCalled();
  });
});
