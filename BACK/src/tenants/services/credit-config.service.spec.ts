import { NotFoundException } from '@nestjs/common';
import { CreditConfigService } from './credit-config.service';

function makeConfig(overrides = {}) {
  return {
    id: 'config-1',
    tenantId: 'tenant-1',
    isEnabled: true,
    plans: [],
    interestComponents: [],
    ...overrides,
  };
}

describe('CreditConfigService', () => {
  let service: CreditConfigService;
  let repo: {
    findByTenant: jest.Mock;
    upsertConfig: jest.Mock;
    createComponent: jest.Mock;
    updateComponent: jest.Mock;
    deleteComponent: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findByTenant: jest.fn(),
      upsertConfig: jest.fn(),
      createComponent: jest.fn(),
      updateComponent: jest.fn(),
      deleteComponent: jest.fn(),
    };
    service = new CreditConfigService(repo as any);
  });

  describe('setEnabled', () => {
    it('passes delinquencyThresholdDays through to the repository', async () => {
      repo.upsertConfig.mockResolvedValue(makeConfig());
      await service.setEnabled('tenant-1', true, 30, 5, 5, 3);
      expect(repo.upsertConfig).toHaveBeenCalledWith(
        'tenant-1',
        true,
        30,
        5,
        5,
        3,
        undefined,
        undefined,
      );
    });

    it('passes the rating ranges and the uncollectible days to the repository', async () => {
      repo.upsertConfig.mockResolvedValue(makeConfig());
      await service.setEnabled(
        'tenant-1',
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        [0, 7, 20, 45],
        180,
      );
      expect(repo.upsertConfig).toHaveBeenCalledWith(
        'tenant-1',
        true,
        undefined,
        undefined,
        undefined,
        undefined,
        [0, 7, 20, 45],
        180,
      );
    });

    it('rejects rating ranges that are not strictly increasing', () => {
      expect(() =>
        service.setEnabled(
          'tenant-1',
          true,
          undefined,
          undefined,
          undefined,
          undefined,
          [0, 10, 10, 30],
        ),
      ).toThrow('orden creciente');
      expect(repo.upsertConfig).not.toHaveBeenCalled();
    });
  });

  describe('addComponent', () => {
    it('creates the CreditConfig row on first use without touching an existing isEnabled', async () => {
      repo.findByTenant.mockResolvedValue(makeConfig({ isEnabled: true }));
      repo.upsertConfig.mockResolvedValue(makeConfig({ isEnabled: true }));
      repo.createComponent.mockResolvedValue({ id: 'comp-1' });

      await service.addComponent('tenant-1', {
        name: 'Mora',
        frequency: 'DAILY',
        percentage: 1,
      } as any);

      expect(repo.upsertConfig).toHaveBeenCalledWith('tenant-1', true);
      expect(repo.createComponent).toHaveBeenCalledWith(
        'tenant-1',
        'config-1',
        expect.objectContaining({ name: 'Mora' }),
      );
    });

    it('defaults isEnabled to false when no config exists yet', async () => {
      repo.findByTenant.mockResolvedValue(null);
      repo.upsertConfig.mockResolvedValue(makeConfig({ isEnabled: false }));
      repo.createComponent.mockResolvedValue({ id: 'comp-1' });

      await service.addComponent('tenant-1', {
        name: 'Mora',
        frequency: 'DAILY',
        percentage: 1,
      } as any);

      expect(repo.upsertConfig).toHaveBeenCalledWith('tenant-1', false);
    });
  });

  describe('updateComponent', () => {
    it('throws NotFoundException when the component does not belong to the tenant', async () => {
      repo.findByTenant.mockResolvedValue(
        makeConfig({ interestComponents: [{ id: 'other' }] }),
      );
      await expect(
        service.updateComponent('tenant-1', 'comp-1', { percentage: 5 } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.updateComponent).not.toHaveBeenCalled();
    });

    it('updates when the component exists', async () => {
      repo.findByTenant.mockResolvedValue(
        makeConfig({ interestComponents: [{ id: 'comp-1' }] }),
      );
      repo.updateComponent.mockResolvedValue({ id: 'comp-1', percentage: 5 });

      await service.updateComponent('tenant-1', 'comp-1', {
        percentage: 5,
      });

      expect(repo.updateComponent).toHaveBeenCalledWith('comp-1', {
        percentage: 5,
      });
    });
  });

  describe('removeComponent', () => {
    it('throws NotFoundException when the component does not belong to the tenant', async () => {
      repo.findByTenant.mockResolvedValue(
        makeConfig({ interestComponents: [] }),
      );
      await expect(
        service.removeComponent('tenant-1', 'comp-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.deleteComponent).not.toHaveBeenCalled();
    });

    it('deletes when the component exists', async () => {
      repo.findByTenant.mockResolvedValue(
        makeConfig({ interestComponents: [{ id: 'comp-1' }] }),
      );
      await service.removeComponent('tenant-1', 'comp-1');
      expect(repo.deleteComponent).toHaveBeenCalledWith('comp-1');
    });
  });
});
