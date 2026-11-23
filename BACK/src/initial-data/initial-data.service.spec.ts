import { Industry } from '@prisma/client';
import { InitialDataRegistry } from './initial-data.registry';
import { InitialDataService } from './initial-data.service';
import {
  defineInitialData,
  namesByIndustry,
  type InitialDataItem,
  type InitialDataSet,
} from './initial-data.types';

const tx = { tx: true };

function makeSet(
  overrides: Partial<InitialDataSet['definition']> = {},
  existing: string[] = [],
) {
  const set = {
    definition: defineInitialData<InitialDataItem>({
      name: 'inventory.categories',
      module: 'inventory',
      whenExisting: 'keep',
      versions: [
        {
          version: 1,
          items: namesByIndustry({
            ELECTRODOMESTICOS: ['Heladeras', 'Accesorios'],
            FERRETERIA: ['Herramientas', 'Accesorios'],
            OTRO: ['General'],
          }),
        },
      ],
      ...overrides,
    }),
    existingKeys: jest.fn().mockResolvedValue(new Set(existing)),
    create: jest.fn().mockResolvedValue(undefined),
  };
  return set;
}

describe('InitialDataService', () => {
  let registry: InitialDataRegistry;
  let repository: {
    appliedVersions: jest.Mock;
    lockedVersion: jest.Mock;
    saveVersion: jest.Mock;
    industryOf: jest.Mock;
    tenantIds: jest.Mock;
  };
  let tenantModules: { findActiveModuleNames: jest.Mock };
  let prisma: { $transaction: jest.Mock };
  let service: InitialDataService;

  beforeEach(() => {
    registry = new InitialDataRegistry({} as never, {} as never);
    repository = {
      appliedVersions: jest.fn().mockResolvedValue(new Map()),
      lockedVersion: jest.fn().mockResolvedValue(0),
      saveVersion: jest.fn().mockResolvedValue(undefined),
      industryOf: jest.fn().mockResolvedValue(Industry.ELECTRODOMESTICOS),
      tenantIds: jest.fn().mockResolvedValue([]),
    };
    tenantModules = {
      findActiveModuleNames: jest
        .fn()
        .mockResolvedValue(['inventory', 'documents']),
    };
    prisma = {
      $transaction: jest.fn((callback: (t: unknown) => unknown) =>
        callback(tx),
      ),
    };
    service = new InitialDataService(
      prisma as never,
      registry,
      repository as never,
      tenantModules as never,
    );
  });

  it('gives a new company the items of its industry and records the version', async () => {
    const set = makeSet();
    registry.register(set);

    await expect(service.applyPending('tenant-1')).resolves.toEqual([
      'inventory.categories',
    ]);

    expect(set.create).toHaveBeenCalledWith(
      'tenant-1',
      [
        { key: 'Heladeras', industries: ['ELECTRODOMESTICOS'] },
        { key: 'Accesorios', industries: ['ELECTRODOMESTICOS', 'FERRETERIA'] },
      ],
      tx,
    );
    expect(repository.saveVersion).toHaveBeenCalledWith(
      tx,
      'tenant-1',
      'inventory.categories',
      1,
    );
  });

  it('treats a company without industry as Otro', async () => {
    repository.industryOf.mockResolvedValue(null);
    const set = makeSet();
    registry.register(set);

    await service.applyPending('tenant-1');

    expect(set.create).toHaveBeenCalledWith(
      'tenant-1',
      [{ key: 'General', industries: ['OTRO'] }],
      tx,
    );
  });

  it('does not touch the data of a module that is off', async () => {
    tenantModules.findActiveModuleNames.mockResolvedValue(['documents']);
    const set = makeSet();
    registry.register(set);

    await expect(service.applyPending('tenant-1')).resolves.toEqual([]);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('opens no transaction when the company is up to date', async () => {
    repository.appliedVersions.mockResolvedValue(
      new Map([['inventory.categories', 1]]),
    );
    registry.register(makeSet());

    await service.applyPending('tenant-1');

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('skips the set when another application got there first', async () => {
    repository.lockedVersion.mockResolvedValue(1);
    const set = makeSet();
    registry.register(set);

    await service.applyPending('tenant-1');

    expect(set.create).not.toHaveBeenCalled();
    expect(repository.saveVersion).not.toHaveBeenCalled();
  });

  it('keeps the list of a company that already has some of the group', async () => {
    const set = makeSet({ whenExisting: 'keep' }, ['Mis heladeras']);
    registry.register(set);

    await service.applyPending('tenant-1');

    expect(set.create).not.toHaveBeenCalled();
    expect(repository.saveVersion).toHaveBeenCalledWith(
      tx,
      'tenant-1',
      'inventory.categories',
      1,
    );
  });

  it('fills only what is missing when the set fills by item', async () => {
    const set = makeSet({ whenExisting: 'fill' }, ['Heladeras']);
    registry.register(set);

    await service.applyPending('tenant-1');

    expect(set.create).toHaveBeenCalledWith(
      'tenant-1',
      [{ key: 'Accesorios', industries: ['ELECTRODOMESTICOS', 'FERRETERIA'] }],
      tx,
    );
  });

  it('applies only the new items of a later version, so what the company removed does not come back', async () => {
    repository.appliedVersions.mockResolvedValue(
      new Map([['inventory.categories', 1]]),
    );
    repository.lockedVersion.mockResolvedValue(1);
    const set = makeSet({
      versions: [
        { version: 1, items: [{ key: 'Heladeras' }] },
        { version: 2, items: [{ key: 'Climatización' }] },
      ],
    });
    registry.register(set);

    await service.applyPending('tenant-1');

    expect(set.create).toHaveBeenCalledWith(
      'tenant-1',
      [{ key: 'Climatización' }],
      tx,
    );
    expect(repository.saveVersion).toHaveBeenCalledWith(
      tx,
      'tenant-1',
      'inventory.categories',
      2,
    );
  });

  it('applies the other sets when one fails, then reports the failure to be retried', async () => {
    const broken = makeSet({ name: 'inventory.categories' });
    broken.create.mockRejectedValue(new Error('db down'));
    const working = makeSet({
      name: 'documents.categories',
      module: 'documents',
    });
    registry.register(broken);
    registry.register(working);

    await expect(service.applyPending('tenant-1')).rejects.toThrow(
      'inventory.categories: db down',
    );
    expect(working.create).toHaveBeenCalled();
  });

  it('goes through every company in chunks and counts the failures', async () => {
    const first = Array.from({ length: 200 }, (_, i) => `t-${i}`);
    repository.tenantIds
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(['t-last']);
    const apply = jest
      .spyOn(service, 'applyPending')
      .mockImplementation((tenantId: string) =>
        tenantId === 't-last'
          ? Promise.reject(new Error('boom'))
          : Promise.resolve([]),
      );

    await expect(service.applyToAllTenants()).resolves.toEqual({
      tenants: 201,
      failed: 1,
    });
    expect(repository.tenantIds).toHaveBeenNthCalledWith(2, 't-199', 200);
    expect(apply).toHaveBeenCalledTimes(201);
  });
});

describe('initial data definitions', () => {
  it('rejects versions that skip a number', () => {
    expect(() =>
      defineInitialData({
        name: 'x',
        module: 'inventory',
        whenExisting: 'keep',
        versions: [
          { version: 1, items: [] },
          { version: 3, items: [] },
        ],
      }),
    ).toThrow('las versiones van de 1 en 1');
  });

  it('refuses two sets with the same name', () => {
    const registry = new InitialDataRegistry({} as never, {} as never);
    registry.register(makeSet());
    expect(() => registry.register(makeSet())).toThrow(
      'Conjunto de datos iniciales repetido: inventory.categories',
    );
  });
});
