import { ReportsService } from './reports.service';

describe('ReportsService.salesReport', () => {
  const closedOrders = jest.fn();
  const service = new ReportsService(
    { closedOrders },
    { productsWithMovements: jest.fn() },
    { receivables: jest.fn() },
  );

  beforeEach(() => {
    closedOrders.mockReset().mockResolvedValue([]);
  });

  it('asks Ventas for the closed sales of the tenant and the period', async () => {
    await service.salesReport('tenant-1', '2026-11-01', '2026-11-30');

    expect(closedOrders).toHaveBeenCalledWith('tenant-1', {
      from: new Date('2026-11-01'),
      to: new Date('2026-11-30'),
    });
  });

  it('adds delivered sales to the revenue', async () => {
    closedOrders.mockResolvedValue([
      {
        status: 'DELIVERED',
        orderDate: new Date('2026-11-02T12:00:00Z'),
        items: [{ productId: null, quantity: 2, unitPrice: '150' }],
      },
    ]);

    const report = await service.salesReport('tenant-1');

    expect(report.summary.totalRevenue).toBe(300);
    expect(report.summary.ordersCount).toBe(1);
  });

  it('reports nothing while Ventas is off', async () => {
    const report = await service.salesReport('tenant-1');

    expect(report.summary).toMatchObject({ totalRevenue: 0, ordersCount: 0 });
    expect(report.byMonth).toEqual([]);
  });
});
