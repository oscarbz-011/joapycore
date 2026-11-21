import { ConflictException, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import type {
  NewUserAccount,
  UserAccounts,
} from '../../common/contracts/user-accounts.contract';
import {
  buildTempPasswordExpiry,
  encryptTempPassword,
  generateTempPassword,
} from '../../common/utils/temp-password.util';
import {
  buildUsernameBase,
  resolveUsername,
} from '../../common/utils/username.util';
import { UsersRepository } from '../repositories/users.repository';

const SALT_ROUNDS = 10;

@Injectable()
export class UserAccountsService implements UserAccounts {
  constructor(private readonly usersRepository: UsersRepository) {}

  async createWithTempPassword(
    tx: Prisma.TransactionClient,
    tenantId: string,
    account: NewUserAccount,
  ) {
    if (await this.usersRepository.findByEmail(account.email, tx)) {
      throw new ConflictException('El email ya está en uso');
    }
    const base = buildUsernameBase(account.firstName, account.lastName);
    const taken = await this.usersRepository.findUsernamesStartingWith(base);
    const temp = await this.newTempPassword();
    const user = await this.usersRepository.create(
      tenantId,
      {
        email: account.email,
        username: resolveUsername(base, taken),
        firstName: account.firstName,
        lastName: account.lastName,
        branchId: account.branchId ?? undefined,
        mustChangePassword: true,
        ...temp.fields,
      },
      tx,
    );
    if (account.roleId) {
      await this.usersRepository.attachRole(
        tenantId,
        user.id,
        account.roleId,
        tx,
      );
    }
    return { userId: user.id, tempPassword: temp.plain };
  }

  async resetTempPassword(tenantId: string, userId: string) {
    const temp = await this.newTempPassword();
    await this.usersRepository.update(tenantId, userId, {
      ...temp.fields,
      mustChangePassword: true,
      sessionsValidAfter: new Date(),
    });
    return { tempPassword: temp.plain };
  }

  async deactivate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    userId: string,
  ) {
    await this.usersRepository.update(
      tenantId,
      userId,
      { status: 'INACTIVE', sessionsValidAfter: new Date() },
      tx,
    );
  }

  async setBranch(tenantId: string, userId: string, branchId: string | null) {
    await this.usersRepository.update(tenantId, userId, { branchId });
  }

  async findByEmail(email: string) {
    const user = await this.usersRepository.findByEmail(email);
    return user ? { id: user.id, tenantId: user.tenantId } : null;
  }

  private async newTempPassword() {
    const plain = generateTempPassword();
    return {
      plain,
      fields: {
        passwordHash: await bcrypt.hash(plain, SALT_ROUNDS),
        tempPasswordEncrypted: encryptTempPassword(plain),
        tempPasswordExpiresAt: buildTempPasswordExpiry(),
      },
    };
  }
}
