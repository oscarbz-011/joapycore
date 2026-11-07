import { ReportsService } from './reports.service';
import { ReportsRepository } from '../repositories/reports.repository';

describe('ReportsService.salesReport', () => {
  const findSaleOrdersForReport = jest.fn();
  const service = new ReportsService({
    findSaleOrdersForReport,
  } as unknown as ReportsRepository);

  beforeEach(() => {
    findSaleOrdersForReport.mockReset().mockResolvedValue([]);
  });

  it('includes paid and delivered sales, scoped to the tenant', async () => {
    await service.salesReport('tenant-1');

    const where = findSaleOrdersForReport.mock.calls[0][0];
    expect(where.tenantId).toBe('tenant-1');
    expect(where.status.in).toEqual(
      expect.arrayContaining([
        'PAYMENT_RECEIVED',
        'CONFIRMED',
        'INVOICED',
        'DELIVERED',
      ]),
    );
    expect(where.status.in).not.toContain('PENDING');
    expect(where.status.in).not.toContain('QUOTED');
    expect(where.status.in).not.toContain('CANCELLED');
    expect(where.status.in).not.toContain('PENDING_CREDIT_APPROVAL');
  });

  it('adds delivered sales to the revenue', async () => {
    findSaleOrdersForReport.mockResolvedValue([
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
});
