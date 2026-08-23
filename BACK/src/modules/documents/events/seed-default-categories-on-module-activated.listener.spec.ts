import { DEFAULT_DOCUMENT_CATEGORIES } from '../constants/default-categories.constant';
import { SeedDefaultCategoriesOnModuleActivatedListener } from './seed-default-categories-on-module-activated.listener';

describe('SeedDefaultCategoriesOnModuleActivatedListener', () => {
  let categoriesRepository: { findAll: jest.Mock; create: jest.Mock };
  let listener: SeedDefaultCategoriesOnModuleActivatedListener;

  beforeEach(() => {
    categoriesRepository = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'cat-1' }),
    };
    listener = new SeedDefaultCategoriesOnModuleActivatedListener(categoriesRepository as any);
  });

  it('seeds the default categories when the documents module is activated for the first time', async () => {
    await listener.handle({ tenantId: 'tenant-1', moduleName: 'documents' });

    expect(categoriesRepository.create).toHaveBeenCalledTimes(DEFAULT_DOCUMENT_CATEGORIES.length);
    for (const name of DEFAULT_DOCUMENT_CATEGORIES) {
      expect(categoriesRepository.create).toHaveBeenCalledWith('tenant-1', name);
    }
  });

  it('ignores activations of modules other than documents', async () => {
    await listener.handle({ tenantId: 'tenant-1', moduleName: 'sales' });

    expect(categoriesRepository.findAll).not.toHaveBeenCalled();
    expect(categoriesRepository.create).not.toHaveBeenCalled();
  });

  it('does not reseed when the tenant already has categories', async () => {
    categoriesRepository.findAll.mockResolvedValue([{ id: 'existing' }]);

    await listener.handle({ tenantId: 'tenant-1', moduleName: 'documents' });

    expect(categoriesRepository.create).not.toHaveBeenCalled();
  });

  it('is best-effort — swallows errors instead of throwing', async () => {
    categoriesRepository.findAll.mockRejectedValue(new Error('db down'));

    await expect(
      listener.handle({ tenantId: 'tenant-1', moduleName: 'documents' }),
    ).resolves.toBeUndefined();
  });
});
