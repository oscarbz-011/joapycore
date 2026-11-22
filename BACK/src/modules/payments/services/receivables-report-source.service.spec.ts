import { ReceivablesReportSourceService } from './receivables-report-source.service';

describe('ReceivablesReportSourceService', () => {
  const setup = (paymentsActive: boolean) => {
    const rows = [{ id: 'ar-1' }];
    const repository = { findAll: jest.fn().mockResolvedValue(rows) };
    const modules = { isActive: jest.fn().mockResolvedValue(paymentsActive) };
    return {
      rows,
      repository,
      modules,
      source: new ReceivablesReportSourceService(
        repository as never,
        modules as never,
      ),
    };
  };

  it('returns the receivables of the company', async () => {
    const { source, repository, modules, rows } = setup(true);

    await expect(source.receivables('tenant-1')).resolves.toBe(rows);
    expect(modules.isActive).toHaveBeenCalledWith('tenant-1', 'payments');
    expect(repository.findAll).toHaveBeenCalledWith('tenant-1');
  });

  it('has no receivables while Pagos is off', async () => {
    const { source, repository } = setup(false);

    await expect(source.receivables('tenant-1')).resolves.toEqual([]);
    expect(repository.findAll).not.toHaveBeenCalled();
  });
});
