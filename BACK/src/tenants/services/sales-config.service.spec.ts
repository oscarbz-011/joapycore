import { SalesConfigService } from './sales-config.service';

describe('SalesConfigService', () => {
  const repo = { findByTenant: jest.fn(), upsertConfig: jest.fn() };
  const tenants = { findById: jest.fn() };
  const service = new SalesConfigService(repo as never, tenants as never);

  beforeEach(() => jest.resetAllMocks());

  it('follows the industry while the company has not chosen', async () => {
    repo.findByTenant.mockResolvedValue(null);
    tenants.findById.mockResolvedValue({ industry: 'MUEBLERIA' });

    await expect(service.get('t1')).resolves.toEqual({
      combosEnabled: false,
      presentationsEnabled: true,
      presentationsChosen: null,
    });
  });

  it('uses what the company chose over its industry', async () => {
    repo.findByTenant.mockResolvedValue({
      combosEnabled: true,
      presentationsEnabled: true,
    });
    tenants.findById.mockResolvedValue({ industry: 'ELECTRODOMESTICOS' });

    await expect(service.get('t1')).resolves.toEqual({
      combosEnabled: true,
      presentationsEnabled: true,
      presentationsChosen: true,
    });
  });

  it('saves only what changed and returns the resolved config', async () => {
    repo.findByTenant.mockResolvedValue({
      combosEnabled: true,
      presentationsEnabled: null,
    });
    tenants.findById.mockResolvedValue({ industry: 'FERRETERIA' });

    const result = await service.update('t1', { presentationsEnabled: null });

    expect(repo.upsertConfig).toHaveBeenCalledWith('t1', {
      presentationsEnabled: null,
    });
    expect(result.presentationsEnabled).toBe(true);
  });
});
