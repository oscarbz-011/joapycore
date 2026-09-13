/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { PositionsRepository } from './positions.repository';

describe('PositionsRepository', () => {
  let repository: PositionsRepository;
  let prisma: {
    position: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      upsert: jest.Mock;
      updateMany: jest.Mock;
    };
  };

  beforeEach(() => {
    prisma = {
      position: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        upsert: jest.fn(),
        updateMany: jest.fn(),
      },
    };
    repository = new PositionsRepository(prisma as any);
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns all positions for the tenant (active AND inactive)', async () => {
      const positions = [
        { id: 'pos-1', name: 'Vendedor', isActive: true },
        { id: 'pos-2', name: 'Cajero', isActive: false },
      ];
      prisma.position.findMany.mockResolvedValue(positions);

      const result = await repository.findAll('tenant-1');

      expect(prisma.position.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId: 'tenant-1' } }),
      );
      // Must NOT have isActive filter — this was the bug
      const callArg = prisma.position.findMany.mock.calls[0][0];
      expect(callArg.where).not.toHaveProperty('isActive');
      expect(result).toHaveLength(2);
    });
  });

  // ── create (upsert behavior) ───────────────────────────────────────────────

  describe('create', () => {
    it('creates a new position when none exists', async () => {
      const created = {
        id: 'pos-1',
        name: 'Vendedor',
        isActive: true,
        tenantId: 'tenant-1',
      };
      prisma.position.upsert.mockResolvedValue(created);

      const result = await repository.create('tenant-1', { name: 'Vendedor' });

      expect(prisma.position.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId_name: { tenantId: 'tenant-1', name: 'VENDEDOR' } },
          create: { name: 'VENDEDOR', tenantId: 'tenant-1' },
          update: expect.objectContaining({ isActive: true }),
        }),
      );
      expect(result.name).toBe('Vendedor');
    });

    it('reactivates an existing inactive position instead of failing with unique constraint', async () => {
      // Simulates the scenario: position was deactivated → user tries to create again
      const reactivated = {
        id: 'pos-1',
        name: 'Vendedor',
        isActive: true,
        tenantId: 'tenant-1',
      };
      prisma.position.upsert.mockResolvedValue(reactivated);

      const result = await repository.create('tenant-1', { name: 'Vendedor' });

      // upsert must fire with update: { isActive: true } — NO unique constraint error
      expect(prisma.position.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({ isActive: true }),
        }),
      );
      expect(result.isActive).toBe(true);
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('deactivates a position', async () => {
      prisma.position.updateMany.mockResolvedValue({ count: 1 });

      await repository.update('tenant-1', 'pos-1', { isActive: false });

      expect(prisma.position.updateMany).toHaveBeenCalledWith({
        where: { id: 'pos-1', tenantId: 'tenant-1' },
        data: { isActive: false },
      });
    });
  });
});
