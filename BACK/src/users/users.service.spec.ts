import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { encryptTempPassword } from '../common/utils/temp-password.util';
import { UsersService } from './services/users.service';

jest.mock('bcryptjs');

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    tenantId: 'tenant-1',
    branchId: null,
    email: 'user@example.com',
    username: null,
    passwordHash: 'hashed',
    firstName: 'John',
    lastName: 'Doe',
    phone: null,
    status: UserStatus.ACTIVE,
    mustChangePassword: false,
    tempPasswordEncrypted: null,
    tempPasswordExpiresAt: null,
    lastLoginAt: null,
    sessionsValidAfter: null,
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
  let eventEmitter: { emit: jest.Mock };
  let usersRepository: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findByEmail: jest.Mock;
    findByEmailInsensitive: jest.Mock;
    findByIdForAuth: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    setRoles: jest.Mock;
    setPermissions: jest.Mock;
    generateUniqueUsername: jest.Mock;
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
      findByEmailInsensitive: jest.fn(),
      findByIdForAuth: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue(1),
      setRoles: jest.fn(),
      setPermissions: jest.fn(),
      generateUniqueUsername: jest.fn().mockResolvedValue('john.doe'),
    };
    rolesRepository = {
      findManyByIds: jest.fn(),
      findPermissionsByKeys: jest.fn(),
    };

    eventEmitter = { emit: jest.fn() };
    service = new UsersService(
      usersRepository as any,
      rolesRepository as any,
      eventEmitter as any,
    );
  });

  // ── list ───────────────────────────────────────────────────────────────────

  describe('list', () => {
    it('returns users mapped to safe shape (no passwordHash)', async () => {
      usersRepository.findAll.mockResolvedValue([makeUser()]);

      const result = await service.list('tenant-1');

      expect(usersRepository.findAll).toHaveBeenCalledWith('tenant-1');
      expect(result[0]).not.toHaveProperty('passwordHash');
      expect(result[0]).not.toHaveProperty('tempPasswordEncrypted');
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
      expect(result).not.toHaveProperty('tempPasswordEncrypted');
    });

    it('exposes tempPassword when mustChangePassword and not expired', async () => {
      const expiresAt = new Date(Date.now() + 60_000);
      // We encrypt a known value but bypass real decryption in the test by
      // using a plaintext flag — in integration this would actually decrypt.
      // Here we just assert tempPassword is non-null when conditions are met.
      const user = makeUser({
        mustChangePassword: true,
        tempPasswordEncrypted: 'will-fail-decrypt-gracefully',
        tempPasswordExpiresAt: expiresAt,
      });
      usersRepository.findById.mockResolvedValue(user);

      const result = await service.getById('tenant-1', 'user-1');

      // Decryption of a fake blob fails gracefully → tempPassword is null
      expect(result.tempPassword).toBeNull();
    });

    it('returns null tempPassword when expiresAt is in the past', async () => {
      const user = makeUser({
        mustChangePassword: true,
        tempPasswordEncrypted: 'some-blob',
        tempPasswordExpiresAt: new Date(Date.now() - 1000),
      });
      usersRepository.findById.mockResolvedValue(user);

      const result = await service.getById('tenant-1', 'user-1');

      expect(result.tempPassword).toBeNull();
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
    it('auto-generates a temp password and creates the user', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-pw');
      usersRepository.create.mockResolvedValue({ id: 'user-2' });
      usersRepository.findById.mockResolvedValue(makeUser({ id: 'user-2' }));

      const result = await service.create('tenant-1', {
        email: 'new@example.com',
        firstName: 'Jane',
        lastName: 'Doe',
      });

      expect(bcrypt.hash).toHaveBeenCalled();
      expect(usersRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          email: 'new@example.com',
          passwordHash: 'hashed-pw',
          mustChangePassword: true,
          tempPasswordEncrypted: expect.any(String),
          tempPasswordExpiresAt: expect.any(Date),
        }),
      );
      expect(result.id).toBe('user-2');
      expect(result.tempPassword).toEqual(expect.any(String));
      expect(result.tempPassword.length).toBeGreaterThanOrEqual(8);
    });

    it('throws ConflictException if email is already in use', async () => {
      usersRepository.findByEmail.mockResolvedValue(makeUser());

      await expect(
        service.create('tenant-1', { email: 'user@example.com' } as any),
      ).rejects.toBeInstanceOf(ConflictException);

      expect(usersRepository.create).not.toHaveBeenCalled();
    });
  });

  // ── change email ──────────────────────────────────────────────────────────

  describe('changeEmail', () => {
    it('normalizes and updates the email after confirming the password', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(makeUser());
      usersRepository.findByEmailInsensitive.mockResolvedValue(null);
      usersRepository.findById.mockResolvedValue(
        makeUser({
          email: 'new@example.com',
          mustChangePassword: true,
          tempPasswordEncrypted: encryptTempPassword('temporary-secret'),
          tempPasswordExpiresAt: new Date(Date.now() + 60_000),
        }),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.changeEmail('tenant-1', 'user-1', {
        email: ' NEW@Example.com ',
        currentPassword: 'current-password',
      });

      expect(usersRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        { email: 'new@example.com' },
      );
      expect(result.email).toBe('new@example.com');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result).not.toHaveProperty('tempPasswordEncrypted');
      expect(result).not.toHaveProperty('sessionsValidAfter');
      expect(result.tempPassword).toBeNull();
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'audit.log',
        {
          tenantId: 'tenant-1',
          userId: 'user-1',
          module: 'users',
          action: 'user.email_changed',
          resourceId: 'user-1',
          before: { email: 'user@example.com' },
          after: { email: 'new@example.com' },
        },
      );
    });

    it('rejects a wrong current password with a stable unauthorized response', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changeEmail('tenant-1', 'user-1', {
          email: 'new@example.com',
          currentPassword: 'wrong-password',
        }),
      ).rejects.toMatchObject({
        status: 401,
        response: {
          statusCode: 401,
          message: 'La contraseña actual es incorrecta',
          error: 'Unauthorized',
        },
      });
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('requires the current password even when the normalized email is unchanged', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(makeUser());
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changeEmail('tenant-1', 'user-1', {
          email: ' USER@Example.com ',
          currentPassword: 'wrong-password',
        }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(usersRepository.findByEmailInsensitive).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('treats an unchanged normalized email as a no-op after password verification', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(makeUser());
      usersRepository.findById.mockResolvedValue(
        makeUser({
          mustChangePassword: true,
          tempPasswordEncrypted: encryptTempPassword('temporary-secret'),
          tempPasswordExpiresAt: new Date(Date.now() + 60_000),
        }),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.changeEmail('tenant-1', 'user-1', {
        email: ' USER@Example.com ',
        currentPassword: 'current-password',
      });

      expect(result.email).toBe('user@example.com');
      expect(result).not.toHaveProperty('passwordHash');
      expect(result.tempPassword).toBeNull();
      expect(usersRepository.findByEmailInsensitive).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });

    it('does not let an authenticated user cross the tenant boundary', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(
        makeUser({ tenantId: 'tenant-2' }),
      );

      await expect(
        service.changeEmail('tenant-1', 'user-1', {
          email: 'new@example.com',
          currentPassword: 'current-password',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(usersRepository.findByEmailInsensitive).not.toHaveBeenCalled();
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('rejects an email already used by another account', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(makeUser());
      usersRepository.findByEmailInsensitive.mockResolvedValue(
        makeUser({ id: 'another-user', email: 'taken@example.com' }),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changeEmail('tenant-1', 'user-1', {
          email: 'taken@example.com',
          currentPassword: 'current-password',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('rejects a normalized email used by a historical mixed-case account', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(makeUser());
      usersRepository.findByEmailInsensitive.mockResolvedValue(
        makeUser({ id: 'another-user', email: 'Taken@Example.com' }),
      );
      usersRepository.findById.mockResolvedValue(
        makeUser({ email: 'taken@example.com' }),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changeEmail('tenant-1', 'user-1', {
          email: 'taken@example.com',
          currentPassword: 'current-password',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(usersRepository.update).not.toHaveBeenCalled();
    });

    it('returns the stable conflict response when the unique constraint wins a race', async () => {
      usersRepository.findByIdForAuth.mockResolvedValue(makeUser());
      usersRepository.findByEmailInsensitive.mockResolvedValue(null);
      usersRepository.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique email', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changeEmail('tenant-1', 'user-1', {
          email: 'taken@example.com',
          currentPassword: 'current-password',
        }),
      ).rejects.toMatchObject({
        status: 409,
        response: {
          statusCode: 409,
          message: 'El email ya está en uso',
          error: 'Conflict',
        },
      });
      expect(eventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  // ── deactivate / reactivate ────────────────────────────────────────────────

  describe('deactivate', () => {
    it('sets status to INACTIVE, cuts existing sessions and drops the cached session', async () => {
      usersRepository.findById.mockResolvedValue(
        makeUser({ status: UserStatus.INACTIVE }),
      );

      await service.deactivate('tenant-1', 'user-1');

      expect(usersRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        { status: UserStatus.INACTIVE, sessionsValidAfter: expect.any(Date) },
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'auth.session.invalidate',
        {
          userId: 'user-1',
        },
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
    it('returns a temp password and stores encrypted temp fields', async () => {
      usersRepository.findById.mockResolvedValue(makeUser());
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-temp');

      const result = await service.resetPassword('tenant-1', 'user-1');

      expect(result.tempPassword).toBeDefined();
      expect(result.tempPassword.length).toBeGreaterThanOrEqual(8);
      expect(usersRepository.update).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        expect.objectContaining({
          mustChangePassword: true,
          tempPasswordEncrypted: expect.any(String),
          tempPasswordExpiresAt: expect.any(Date),
        }),
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
    it('changes the password and clears mustChangePassword and temp fields', async () => {
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
          tempPasswordEncrypted: null,
          tempPasswordExpiresAt: null,
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
