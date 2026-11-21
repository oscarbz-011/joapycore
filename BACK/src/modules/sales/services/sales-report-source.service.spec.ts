import { SalesReportSourceService } from './sales-report-source.service';

describe('SalesReportSourceService', () => {
  const setup = (salesActive: boolean) => {
    const repository = { findOrders: jest.fn().mockResolvedValue([]) };
    const modules = { isActive: jest.fn().mockResolvedValue(salesActive) };
    return {
      repository,
      modules,
      source: new SalesReportSourceService(
        repository as never,
        modules as never,
      ),
    };
  };

  it('includes paid and delivered sales, scoped to the tenant', async () => {
    const { source, repository, modules } = setup(true);

    await source.closedOrders('tenant-1', {});

    expect(modules.isActive).toHaveBeenCalledWith('tenant-1', 'sales');
    const where = repository.findOrders.mock.calls[0][0];
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
    expect(where.orderDate).toBeUndefined();
  });

  it('limits the period when it is given', async () => {
    const { source, repository } = setup(true);
    const from = new Date('2026-11-01');
    const to = new Date('2026-11-30');

    await source.closedOrders('tenant-1', { from, to });

    expect(repository.findOrders.mock.calls[0][0].orderDate).toEqual({
      gte: from,
      lte: to,
    });
  });

  it('has no sales while Ventas is off', async () => {
    const { source, repository } = setup(false);

    await expect(source.closedOrders('tenant-1', {})).resolves.toEqual([]);
    expect(repository.findOrders).not.toHaveBeenCalled();
  });
});
