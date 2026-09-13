import { AreasRepository } from './areas.repository';

describe('AreasRepository', () => {
  let repository: AreasRepository;
  let prisma: {
    area: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      area: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    repository = new AreasRepository(prisma as any);
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all areas including inactive ones', async () => {
      const areas = [
        { id: 'area-1', name: 'Ventas', isActive: true, children: [] },
        { id: 'area-2', name: 'Depósito', isActive: false, children: [] },
      ];
      prisma.area.findMany.mockResolvedValue(areas);

      const result = await repository.findAll('tenant-1');

      const callArg = prisma.area.findMany.mock.calls[0][0];
      // Must NOT filter by isActive at the top level
      expect(callArg.where).not.toHaveProperty('isActive');
      expect(result).toHaveLength(2);
    });
  });

  // ── create (upsert behavior) ───────────────────────────────────────────────

  describe('create', () => {
    it('creates a new area', async () => {
      const created = {
        id: 'area-1',
        name: 'Ventas',
        isActive: true,
        tenantId: 'tenant-1',
      };
      prisma.area.upsert.mockResolvedValue(created);

      const result = await repository.create('tenant-1', { name: 'Ventas' });

      expect(prisma.area.upsert).toHaveBeenCalledWith({
        where: { tenantId_name: { tenantId: 'tenant-1', name: 'Ventas' } },
        create: { name: 'Ventas', tenantId: 'tenant-1' },
        update: { isActive: true },
      });
      expect(result.name).toBe('Ventas');
    });

    it('reactivates an existing inactive area when same name is used again', async () => {
      const reactivated = {
        id: 'area-1',
        name: 'Ventas',
        isActive: true,
        tenantId: 'tenant-1',
      };
      prisma.area.upsert.mockResolvedValue(reactivated);

      const result = await repository.create('tenant-1', { name: 'Ventas' });

      expect(prisma.area.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ update: { isActive: true } }),
      );
      expect(result.isActive).toBe(true);
    });

    it('preserves the parentId on reactivation when provided', async () => {
      const reactivated = {
        id: 'area-2',
        name: 'Sub-ventas',
        isActive: true,
        parentId: 'area-1',
        tenantId: 'tenant-1',
      };
      prisma.area.upsert.mockResolvedValue(reactivated);

      await repository.create('tenant-1', {
        name: 'Sub-ventas',
        parentId: 'area-1',
      });

      expect(prisma.area.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ parentId: 'area-1' }),
        }),
      );
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deactivates an area', async () => {
      prisma.area.updateMany.mockResolvedValue({ count: 1 });

      await repository.update('tenant-1', 'area-1', { isActive: false });

      expect(prisma.area.updateMany).toHaveBeenCalledWith({
        where: { id: 'area-1', tenantId: 'tenant-1' },
        data: { isActive: false },
      });
    });
  });
});
