import { ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserAccountsService } from './user-accounts.service';

jest.mock('bcryptjs');

describe('UserAccountsService', () => {
  const tx = {} as never;
  let users: {
    findByEmail: jest.Mock;
    findUsernamesStartingWith: jest.Mock;
    create: jest.Mock;
    attachRole: jest.Mock;
    update: jest.Mock;
  };
  let service: UserAccountsService;

  beforeEach(() => {
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed');
    users = {
      findByEmail: jest.fn().mockResolvedValue(null),
      findUsernamesStartingWith: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'user-1' }),
      attachRole: jest.fn(),
      update: jest.fn().mockResolvedValue(1),
    };
    service = new UserAccountsService(users as never);
  });

  describe('createWithTempPassword', () => {
    const account = {
      email: 'ana@company.com',
      firstName: 'Ana',
      lastName: 'López',
      branchId: 'branch-1',
    };

    it('creates the user inside the caller transaction with a temp password', async () => {
      const result = await service.createWithTempPassword(
        tx,
        'tenant-1',
        account,
      );

      expect(users.findByEmail).toHaveBeenCalledWith('ana@company.com', tx);
      expect(users.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({
          email: 'ana@company.com',
          username: 'ana.lopez',
          branchId: 'branch-1',
          passwordHash: 'hashed',
          mustChangePassword: true,
          tempPasswordExpiresAt: expect.any(Date),
        }),
        tx,
      );
      expect(result).toEqual({
        userId: 'user-1',
        tempPassword: expect.any(String),
      });
      expect(users.attachRole).not.toHaveBeenCalled();
    });

    it('picks the next free username', async () => {
      users.findUsernamesStartingWith.mockResolvedValue([
        'ana.lopez',
        'ana.lopez2',
      ]);

      await service.createWithTempPassword(tx, 'tenant-1', account);

      expect(users.create).toHaveBeenCalledWith(
        'tenant-1',
        expect.objectContaining({ username: 'ana.lopez3' }),
        tx,
      );
    });

    it('attaches the role when one is given', async () => {
      await service.createWithTempPassword(tx, 'tenant-1', {
        ...account,
        roleId: 'role-1',
      });

      expect(users.attachRole).toHaveBeenCalledWith(
        'tenant-1',
        'user-1',
        'role-1',
        tx,
      );
    });

    it('rejects an email that is already used', async () => {
      users.findByEmail.mockResolvedValue({ id: 'other' });

      await expect(
        service.createWithTempPassword(tx, 'tenant-1', account),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(users.create).not.toHaveBeenCalled();
    });
  });

  it('deactivates within the tenant and the caller transaction', async () => {
    await service.deactivate(tx, 'tenant-1', 'user-1');

    expect(users.update).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      { status: 'INACTIVE', sessionsValidAfter: expect.any(Date) },
      tx,
    );
  });

  it('resets the temp password and closes open sessions', async () => {
    const result = await service.resetTempPassword('tenant-1', 'user-1');

    expect(result.tempPassword).toEqual(expect.any(String));
    expect(users.update).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      expect.objectContaining({
        passwordHash: 'hashed',
        mustChangePassword: true,
        sessionsValidAfter: expect.any(Date),
      }),
    );
  });

  it('moves the user to another branch or none', async () => {
    await service.setBranch('tenant-1', 'user-1', null);

    expect(users.update).toHaveBeenCalledWith('tenant-1', 'user-1', {
      branchId: null,
    });
  });

  it('returns only the id and tenant of a user found by email', async () => {
    users.findByEmail.mockResolvedValue({
      id: 'user-1',
      tenantId: 'tenant-1',
      passwordHash: 'secret',
    });

    expect(await service.findByEmail('ana@company.com')).toEqual({
      id: 'user-1',
      tenantId: 'tenant-1',
    });
  });
});
