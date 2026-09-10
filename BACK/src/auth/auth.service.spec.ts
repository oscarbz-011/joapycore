/// <reference types="jest" />

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { Industry, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash } from 'node:crypto';
import { AuthService } from './auth.service';

jest.mock('bcryptjs');

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { $transaction: jest.Mock; user: { update: jest.Mock } };
  let configService: { get: jest.Mock };
  let jwtService: { signAsync: jest.Mock };
  let eventEmitter: { emit: jest.Mock };
  let usersRepository: {
    findByEmail: jest.Mock;
    findByEmailOrUsername: jest.Mock;
    create: jest.Mock;
    attachRole: jest.Mock;
    findRolesForUser: jest.Mock;
    findPermissionsForUser: jest.Mock;
    findByIdForAuth: jest.Mock;
  };
  let rolesRepository: {
    findAllPermissions: jest.Mock;
    create: jest.Mock;
    attachPermissions: jest.Mock;
  };
  let tenantsRepository: { create: jest.Mock; findById: jest.Mock };
  let tenantModulesRepository: {
    seedDefaults: jest.Mock;
    findActiveModuleNames: jest.Mock;
  };
  let refreshTokensRepository: {
    create: jest.Mock;
    findById: jest.Mock;
    revoke: jest.Mock;
  };

  const baseUser = {
    id: 'user-1',
    tenantId: 'tenant-1',
    email: 'owner@example.com',
    passwordHash: 'hashed-password',
    firstName: 'Ada',
    lastName: 'Lovelace',
    status: UserStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn((callback: (tx: unknown) => unknown) =>
        callback({}),
      ),
      user: { update: jest.fn().mockResolvedValue({}) },
    };
    configService = {
      get: jest.fn((_key: string, fallback?: unknown) => fallback),
    };
    jwtService = {
      signAsync: jest.fn().mockResolvedValue('signed-access-token'),
    };
    eventEmitter = { emit: jest.fn() };
    usersRepository = {
      findByEmail: jest.fn(),
      findByEmailOrUsername: jest.fn(),
      create: jest.fn(),
      attachRole: jest.fn(),
      findRolesForUser: jest.fn().mockResolvedValue([]),
      findPermissionsForUser: jest.fn().mockResolvedValue([]),
      findByIdForAuth: jest.fn(),
    };
    rolesRepository = {
      findAllPermissions: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      attachPermissions: jest.fn(),
    };
    tenantsRepository = {
      create: jest.fn(),
      findById: jest.fn().mockResolvedValue({ id: 'tenant-1', name: 'Acme' }),
    };
    tenantModulesRepository = {
      seedDefaults: jest.fn(),
      findActiveModuleNames: jest.fn().mockResolvedValue([]),
    };
    refreshTokensRepository = {
      create: jest.fn().mockResolvedValue({ id: 'refresh-1' }),
      findById: jest.fn(),
      revoke: jest.fn(),
    };

    service = new AuthService(
      prisma as any,
      configService as any,
      jwtService as any,
      eventEmitter as any,
      usersRepository as any,
      rolesRepository as any,
      tenantsRepository as any,
      tenantModulesRepository as any,
      refreshTokensRepository as any,
    );
  });

  describe('register', () => {
    it('creates a tenant, owner role and user in one transaction', async () => {
      usersRepository.findByEmail.mockResolvedValue(null);
      rolesRepository.findAllPermissions.mockResolvedValue([
        { id: 'perm-1', key: 'tenants:read' },
      ]);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
      tenantsRepository.create.mockResolvedValue({
        id: 'tenant-1',
        name: 'Acme',
      });
      rolesRepository.create.mockResolvedValue({ id: 'role-1', name: 'Owner' });
      usersRepository.create.mockResolvedValue(baseUser);

      const result = await service.register({
        tenantName: 'Acme',
        industry: Industry.ELECTRODOMESTICOS,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'owner@example.com',
        password: 'super-secret',
      });

      expect(rolesRepository.create).toHaveBeenCalledWith(
        'tenant-1',
        'Owner',
        true,
        {},
      );
      expect(rolesRepository.attachPermissions).toHaveBeenCalledWith(
        'role-1',
        ['perm-1'],
        {},
      );
      expect(usersRepository.attachRole).toHaveBeenCalledWith(
        'user-1',
        'role-1',
        {},
      );
      expect(tenantModulesRepository.seedDefaults).toHaveBeenCalledWith(
        'tenant-1',
        'electrodomesticos',
        {},
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('user.registered', {
        userId: 'user-1',
        tenantId: 'tenant-1',
      });
      expect(result.accessToken).toBe('signed-access-token');
      expect(result.user).not.toHaveProperty('passwordHash');
    });

    it('rejects registration when the email is already taken', async () => {
      usersRepository.findByEmail.mockResolvedValue(baseUser);

      await expect(
        service.register({ email: baseUser.email } as any),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('issues tokens for valid credentials with email', async () => {
      usersRepository.findByEmailOrUsername.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        emailOrUsername: baseUser.email,
        password: 'secret',
      });

      expect(bcrypt.compare).toHaveBeenCalledWith(
        'secret',
        baseUser.passwordHash,
      );
      expect(eventEmitter.emit).toHaveBeenCalledWith('user.logged_in', {
        userId: baseUser.id,
        tenantId: baseUser.tenantId,
      });
      expect(result.accessToken).toBe('signed-access-token');
    });

    it('issues tokens for valid credentials with username', async () => {
      usersRepository.findByEmailOrUsername.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        emailOrUsername: 'ada_lovelace',
        password: 'secret',
      });

      expect(result.accessToken).toBe('signed-access-token');
    });

    it('rejects an incorrect password', async () => {
      usersRepository.findByEmailOrUsername.mockResolvedValue(baseUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ emailOrUsername: baseUser.email, password: 'wrong' } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown email or username', async () => {
      usersRepository.findByEmailOrUsername.mockResolvedValue(null);

      await expect(
        service.login({
          emailOrUsername: 'nobody@example.com',
          password: 'secret',
        } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('rotates a valid refresh token', async () => {
      const secret = 'a'.repeat(64);
      const tokenHash = createHash('sha256').update(secret).digest('hex');
      refreshTokensRepository.findById.mockResolvedValue({
        id: 'refresh-1',
        userId: baseUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        createdAt: new Date(),
      });
      usersRepository.findByIdForAuth.mockResolvedValue(baseUser);

      const result = await service.refresh({
        refreshToken: `refresh-1.${secret}`,
      });

      expect(refreshTokensRepository.revoke).toHaveBeenCalledWith('refresh-1');
      expect(usersRepository.findByIdForAuth).toHaveBeenCalledWith(baseUser.id);
      expect(result.accessToken).toBe('signed-access-token');
    });

    it('rejects a revoked refresh token', async () => {
      const secret = 'b'.repeat(64);
      const tokenHash = createHash('sha256').update(secret).digest('hex');
      refreshTokensRepository.findById.mockResolvedValue({
        id: 'refresh-1',
        userId: baseUser.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        createdAt: new Date(),
      });

      await expect(
        service.refresh({ refreshToken: `refresh-1.${secret}` } as any),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(refreshTokensRepository.revoke).not.toHaveBeenCalled();
    });
  });
});
