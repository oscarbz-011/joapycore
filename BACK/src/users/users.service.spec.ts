import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { UsersService } from './services/users.service';

jest.mock('bcryptjs');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@example.com',
    passwordHash: 'hashed',
    firstName: 'John',
    lastName: 'Doe',
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    userRoles: [{ role: { id: 'role-1', name: 'Staff' } }],
    userPermissions: [{ permission: { key: 'users:read' } }],
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByEmail: jest.Mock;
    findByIdForAuth: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    setRoles: jest.Mock;
    setPermissions: jest.Mock;
  };
  let rolesRepository: {
    findManyByIds: jest.Mock;
    findPermissionsByKeys: jest.Mock;
  };

  beforeEach(() => {
    usersRepository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      findByIdForAuth: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(1),
      setRoles: jest.fn(),
      setPermissions: jest.fn(),
    };
    rolesRepository = {
      findManyByIds: jest.fn(),
      findPermissionsByKeys: jest.fn(),
    };

    const eventEmitter = { emit: jest.fn() };
    service = new UsersService(usersRepository as any, rolesRepository as any, eventEmitter as any);
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns users mapped to safe shape (no passwordHash)', async () => {
      usersRepository.findAll.mockResolvedValue([makeUser()]);

      const result = await service.list('tenant-1');

      expect(usersRepository.findAll).toHaveBeenCalledWith('tenant-1');
      expect(result[0]).not.toHaveProperty('passwordHash');
      expect(result[0].roles).toEqual([{ id: 'role-1', name: 'Staff' }]);
      expect(result[0].extraPermissions).toEqual(['users:read']);
    });
  });

  // ── getById ────────────────────────────────────────────────────────────────

  describe('getById', () => {
    it('returns the user when found', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());

      const result = await service.getById('tenant-1', 'user-1');

      expect(result.id).toBe('user-1');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws NotFoundException when user does not exist', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.getById('tenant-1', 'unknown'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── create ─────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('hashes the password and creates the user', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      usersRepository.create.mockResolvedValue({ id: 'user-2' });
      usersRepository.findById.mockResolvedValue(makeUser({ id: 'user-2' }));

      const result = await service.create('tenant-1', {
        email: 'new@example.com',
        password: 'secret123',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 10);
      expect(usersRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          email: 'new@example.com',
          passwordHash: 'hashed-pw',
        }),
      );
      expect(result.id).toBe('user-2');
    });

    it('throws ConflictException if email is already in use', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());

      await expect(
        service.create('tenant-1', { email: 'user@example.com' } as any),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersRepository.create).not.toHaveBeenCalled();
    });
  });

  // ── deactivate / reactivate ────────────────────────────────────────────────

  describe('deactivate', () => {
    it('sets status to INACTIVE', async () => {
      usersRepository.findById.mockResolvedValue(
        makeUser({ status: UserStatus.INACTIVE }),
      );

      await service.deactivate('tenant-1', 'user-1');

      expect(usersRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        { status: UserStatus.INACTIVE },
      );
    });

    it('throws NotFoundException if user does not exist', async () => {
      usersRepository.update.mockResolvedValue(0);

      await expect(
        service.deactivate('tenant-1', 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('reactivate', () => {
    it('sets status to ACTIVE', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());

      await service.reactivate('tenant-1', 'user-1');

      expect(usersRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        { status: UserStatus.ACTIVE },
      );
    });

    it('throws NotFoundException if user does not exist', async () => {
      usersRepository.update.mockResolvedValue(0);

      await expect(
        service.reactivate('tenant-1', 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── resetPassword ──────────────────────────────────────────────────────────

  describe('resetPassword', () => {
    it('returns a temp password and sets mustChangePassword: true', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-temp');

      const result = await service.resetPassword('tenant-1', 'user-1');

      expect(result.tempPassword).toBeDefined();
      expect(result.tempPassword.length).toBeGreaterThanOrEqual(8);
      expect(usersRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({ mustChangePassword: true }),
      );
    });

    it('throws NotFoundException for an unknown user', async () => {
      usersRepository.findById.mockResolvedValue(null);

      await expect(
        service.resetPassword('tenant-1', 'ghost'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── changePassword ─────────────────────────────────────────────────────────

  describe('changePassword', () => {
    it('changes the password and clears mustChangePassword', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hash');

      await service.changePassword('user-1', {
        currentPassword: 'oldpass',
        newPassword: 'newpass123',
      });

      expect(usersRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({
          passwordHash: 'new-hash',
          mustChangePassword: false,
        }),
      );
    });

    it('throws BadRequestException for a wrong current password', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'wrong',
          newPassword: 'newpass123',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws NotFoundException for an unknown userId', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(null);

      await expect(
        service.changePassword('ghost', {
          currentPassword: 'x',
          newPassword: 'y',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── assignRoles ────────────────────────────────────────────────────────────

  describe('assignRoles', () => {
    it('assigns valid non-system roles', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      rolesRepository.findManyByIds.mockResolvedValue([
        { id: 'role-2', name: 'Editor', isSystem: false },
      ]);

      await service.assignRoles('tenant-1', 'user-1', { roleIds: ['role-2'] });

      expect(usersRepository.setRoles).toHaveBeenCalledWith('user-1', [
        'role-2',
      ]);
    });

    it('throws BadRequestException if a role ID does not belong to this tenant', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      rolesRepository.findManyByIds.mockResolvedValue([]); // found 0, requested 1

      await expect(
        service.assignRoles('tenant-1', 'user-1', {
          roleIds: ['foreign-role'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('throws ForbiddenException when trying to assign the Owner system role', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      rolesRepository.findManyByIds.mockResolvedValue([
        { id: 'role-owner', name: 'Owner', isSystem: true },
      ]);

      await expect(
        service.assignRoles('tenant-1', 'user-1', { roleIds: ['role-owner'] }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  // ── setExtraPermissions ────────────────────────────────────────────────────

  describe('setExtraPermissions', () => {
    it('sets extra permissions after validating keys exist', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      rolesRepository.findPermissionsByKeys.mockResolvedValue([
        { id: 'perm-1', key: 'users:read' },
      ]);

      await service.setExtraPermissions('tenant-1', 'user-1', ['users:read']);

      expect(usersRepository.setPermissions).toHaveBeenCalledWith('user-1', [
        'perm-1',
      ]);
    });

    it('throws BadRequestException for unknown permission keys', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      rolesRepository.findPermissionsByKeys.mockResolvedValue([]); // found 0, requested 1

      await expect(
        service.setExtraPermissions('tenant-1', 'user-1', ['invalid:key']),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
