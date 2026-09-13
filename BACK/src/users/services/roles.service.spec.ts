import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { RolesService } from './roles.service';

function makeRole(overrides = {}) {
  return {
    id: 'role-1',
    tenantId: 'tenant-1',
    name: 'Vendedor',
    isSystem: false,
    rolePermissions: [],
    ...overrides,
  };
}

function makePerm(key: string, id = `perm-${key}`) {
  return { id, key };
}

describe('RolesService', () => {
  let service: RolesService;
  let eventEmitter: { emit: jest.Mock };
  let repo: {
    findAllForTenant: jest.Mock;
    findById: jest.Mock;
    findByTenantAndName: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    delete: jest.Mock;
    findAllPermissions: jest.Mock;
    findPermissionsByKeys: jest.Mock;
    replacePermissions: jest.Mock;
  };

  beforeEach(() => {
    repo = {
      findAllForTenant: jest.fn(),
      findById: jest.fn(),
      findByTenantAndName: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findAllPermissions: jest.fn(),
      findPermissionsByKeys: jest.fn(),
      replacePermissions: jest.fn(),
    };
    eventEmitter = { emit: jest.fn() };
    service = new RolesService(repo as any, eventEmitter as any);
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('delegates to repository', () => {
      repo.findAllForTenant.mockResolvedValue([makeRole()]);
      service.list('tenant-1');
      expect(repo.findAllForTenant).toHaveBeenCalledWith('tenant-1');
    });
  });

  // ── getById ────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns role when found', async () => {
      repo.findById.mockResolvedValue(makeRole());
      const result = await service.getById('tenant-1', 'role-1');
      expect(result.id).toBe('role-1');
    });

    it('throws NotFoundException when not found', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(service.getById('tenant-1', 'x')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('creates role when name is unique', async () => {
      repo.findByTenantAndName.mockResolvedValue(null);
      repo.create.mockResolvedValue(makeRole());
      await service.create('tenant-1', { name: 'Vendedor' });
      expect(repo.create).toHaveBeenCalledWith('tenant-1', 'Vendedor');
    });

    it('throws ConflictException when name already exists', async () => {
      repo.findByTenantAndName.mockResolvedValue(makeRole());
      await expect(
        service.create('tenant-1', { name: 'Vendedor' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(repo.create).not.toHaveBeenCalled();
    });
  });

  // ── update ─────────────────────────────────────────────────────────────────

  describe('update', () => {
    it('throws NotFoundException when role does not exist', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update('tenant-1', 'x', { name: 'X' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws ForbiddenException when role is system role', async () => {
      repo.findById.mockResolvedValue(makeRole({ isSystem: true }));
      await expect(
        service.update('tenant-1', 'role-1', { name: 'X' }),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(repo.update).not.toHaveBeenCalled();
    });

    it('updates and returns role when valid', async () => {
      const updated = makeRole({ name: 'Supervisor' });
      repo.findById
        .mockResolvedValueOnce(makeRole())
        .mockResolvedValueOnce(updated);
      repo.update.mockResolvedValue(1);
      const result = await service.update('tenant-1', 'role-1', {
        name: 'Supervisor',
      });
      expect(result.name).toBe('Supervisor');
    });
  });

  // ── delete ─────────────────────────────────────────────────────────────────

  describe('delete', () => {
    it('throws ForbiddenException when role is system role', async () => {
      repo.findById.mockResolvedValue(makeRole({ isSystem: true }));
      await expect(service.delete('tenant-1', 'role-1')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repo.delete).not.toHaveBeenCalled();
    });

    it('deletes non-system role', async () => {
      repo.findById.mockResolvedValue(makeRole());
      repo.delete.mockResolvedValue(undefined);
      await service.delete('tenant-1', 'role-1');
      expect(repo.delete).toHaveBeenCalledWith('tenant-1', 'role-1');
    });
  });

  // ── assignPermissions ──────────────────────────────────────────────────────

  describe('assignPermissions', () => {
    it('throws ForbiddenException for system role', async () => {
      repo.findById.mockResolvedValue(makeRole({ isSystem: true }));
      await expect(
        service.assignPermissions('tenant-1', 'role-1', {
          permissions: ['sales:read'],
        }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws BadRequestException when a permission key is invalid', async () => {
      repo.findById.mockResolvedValue(makeRole());
      repo.findPermissionsByKeys.mockResolvedValue([makePerm('sales:read')]);
      await expect(
        service.assignPermissions('tenant-1', 'role-1', {
          permissions: ['sales:read', 'fake:perm'] as never,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('replaces permissions when all keys are valid', async () => {
      const perms = [makePerm('sales:read'), makePerm('sales:create')];
      repo.findById.mockResolvedValue(makeRole());
      repo.findPermissionsByKeys.mockResolvedValue(perms);
      repo.replacePermissions.mockResolvedValue(undefined);
      repo.findById
        .mockResolvedValueOnce(makeRole())
        .mockResolvedValueOnce(makeRole());

      await service.assignPermissions('tenant-1', 'role-1', {
        permissions: ['sales:read', 'sales:create'],
      });

      expect(repo.replacePermissions).toHaveBeenCalledWith(
        'role-1',
        perms.map((p) => p.id),
      );
    });
  });
});
