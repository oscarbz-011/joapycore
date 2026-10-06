import { AlertsService } from './alerts.service';

describe('AlertsService.findActiveThreshold', () => {
  const setup = (config: unknown) => {
    const repository = { findByType: jest.fn().mockResolvedValue(config) };
    return {
      repository,
      service: new AlertsService(repository as any),
    };
  };

  it('returns the threshold of an active alert of the tenant', async () => {
    const { service, repository } = setup({ isActive: true, threshold: 5 });

    await expect(
      service.findActiveThreshold('tenant-1', 'STOCK_LOW'),
    ).resolves.toBe(5);
    expect(repository.findByType).toHaveBeenCalledWith('tenant-1', 'STOCK_LOW');
  });

  it('ignores an alert that is turned off', async () => {
    const { service } = setup({ isActive: false, threshold: 5 });

    await expect(
      service.findActiveThreshold('tenant-1', 'STOCK_LOW'),
    ).resolves.toBeNull();
  });

  it('is null when the alert has no threshold or does not exist', async () => {
    await expect(
      setup({ isActive: true, threshold: null }).service.findActiveThreshold(
        'tenant-1',
        'STOCK_LOW',
      ),
    ).resolves.toBeNull();
    await expect(
      setup(null).service.findActiveThreshold('tenant-1', 'STOCK_LOW'),
    ).resolves.toBeNull();
  });
});
