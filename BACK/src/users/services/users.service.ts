import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { UserStatus } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RolesRepository } from '../repositories/roles.repository';
import { UsersRepository } from '../repositories/users.repository';
import type { AuditLogEvent } from '../../audit/audit-log.event';
import {
  SESSION_INVALIDATE_EVENT,
  type SessionInvalidateEvent,
} from '../../common/events/session-invalidate.event';
import { AssignUserRolesDto } from '../dto/assign-user-roles.dto';
import { ChangeEmailDto } from '../dto/change-email.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import {
  toSafeUserWithRoles,
  type SafeUserWithRoles,
} from '../entities/user.entity';
import {
  generateTempPassword,
  encryptTempPassword,
  decryptTempPassword,
  buildTempPasswordExpiry,
} from '../../common/utils/temp-password.util';

const SALT_ROUNDS = 10;
const OWNER_ROLE_NAME = 'Owner';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async list(tenantId: string) {
    const users = await this.usersRepository.findAll(tenantId);
    return users.map(toSafeUserWithRoles);
  }

  async getById(tenantId: string, id: string): Promise<SafeUserWithRoles> {
    const user = await this.usersRepository.findById(tenantId, id);
    if (!user) throw new NotFoundException('User not found');
    const safe = toSafeUserWithRoles(user);
    safe.tempPassword = this.resolveTempPassword(user);
    return safe;
  }

  async create(
    tenantId: string,
    dto: CreateUserDto,
    actorId?: string,
  ): Promise<SafeUserWithRoles & { tempPassword: string }> {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const username = await this.usersRepository.generateUniqueUsername(
      dto.firstName,
      dto.lastName,
    );

    const tempPwd = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPwd, SALT_ROUNDS);
    const tempPasswordEncrypted = encryptTempPassword(tempPwd);
    const tempPasswordExpiresAt = buildTempPasswordExpiry();

    const user = await this.usersRepository.create(tenantId, {
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      username,
      mustChangePassword: true,
      tempPasswordEncrypted,
      tempPasswordExpiresAt,
    });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId: actorId,
      module: 'users',
      action: 'user.created',
      resourceId: user.id,
    } satisfies AuditLogEvent);

    const fullUser = await this.usersRepository.findById(tenantId, user.id);
    if (!fullUser) throw new NotFoundException('User not found');
    return { ...toSafeUserWithRoles(fullUser), tempPassword: tempPwd };
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    try {
      const count = await this.usersRepository.update(tenantId, id, dto);
      if (count === 0) throw new NotFoundException('User not found');
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('El username ya está en uso');
      }
      throw e;
    }
    return this.getById(tenantId, id);
  }

  async deactivate(tenantId: string, id: string, actorId?: string) {
    const count = await this.usersRepository.update(tenantId, id, {
      status: UserStatus.INACTIVE,
      sessionsValidAfter: new Date(),
    });
    if (count === 0) throw new NotFoundException('User not found');
    this.invalidateSession({ userId: id });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId: actorId,
      module: 'users',
      action: 'user.deactivated',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.getById(tenantId, id);
  }

  async reactivate(tenantId: string, id: string, actorId?: string) {
    const count = await this.usersRepository.update(tenantId, id, {
      status: UserStatus.ACTIVE,
    });
    if (count === 0) throw new NotFoundException('User not found');
    this.invalidateSession({ userId: id });
    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId: actorId,
      module: 'users',
      action: 'user.reactivated',
      resourceId: id,
    } satisfies AuditLogEvent);
    return this.getById(tenantId, id);
  }

  async resetPassword(
    tenantId: string,
    id: string,
    actorId?: string,
  ): Promise<{ tempPassword: string }> {
    const user = await this.usersRepository.findById(tenantId, id);
    if (!user) throw new NotFoundException('User not found');

    const tempPwd = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPwd, SALT_ROUNDS);
    const tempPasswordEncrypted = encryptTempPassword(tempPwd);
    const tempPasswordExpiresAt = buildTempPasswordExpiry();

    await this.usersRepository.update(tenantId, id, {
      passwordHash,
      mustChangePassword: true,
      tempPasswordEncrypted,
      tempPasswordExpiresAt,
      sessionsValidAfter: new Date(),
    });
    this.invalidateSession({ userId: id });

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId: actorId,
      module: 'users',
      action: 'user.password_reset',
      resourceId: id,
    } satisfies AuditLogEvent);

    return { tempPassword: tempPwd };
  }

  async assignRoles(tenantId: string, id: string, dto: AssignUserRolesDto) {
    await this.getById(tenantId, id);

    const roles = await this.rolesRepository.findManyByIds(
      tenantId,
      dto.roleIds,
    );
    if (roles.length !== dto.roleIds.length) {
      throw new BadRequestException(
        'One or more roles do not belong to this tenant',
      );
    }

    const ownerRole = roles.find(
      (r) => r.name === OWNER_ROLE_NAME && r.isSystem,
    );
    if (ownerRole) {
      throw new ForbiddenException(
        'Cannot assign the Owner role to a regular user',
      );
    }

    await this.usersRepository.setRoles(id, dto.roleIds);
    this.invalidateSession({ userId: id });
    return this.getById(tenantId, id);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersRepository.findByIdForAuth(userId);
    if (!user) throw new NotFoundException('User not found');

    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!matches)
      throw new BadRequestException('La contraseña actual es incorrecta');

    const newHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    // Cierra todas las sesiones abiertas con la contraseña anterior; el
    // front vuelve a autenticarse con la nueva para seguir en esta.
    await this.usersRepository.update(user.tenantId, userId, {
      passwordHash: newHash,
      mustChangePassword: false,
      tempPasswordEncrypted: null,
      tempPasswordExpiresAt: null,
      sessionsValidAfter: new Date(),
    });
    this.invalidateSession({ userId });
  }

  async changeEmail(tenantId: string, userId: string, dto: ChangeEmailDto) {
    const user = await this.usersRepository.findByIdForAuth(userId);
    if (!user || user.tenantId !== tenantId) {
      throw new NotFoundException('User not found');
    }

    const matches = await bcrypt.compare(
      dto.currentPassword,
      user.passwordHash,
    );
    if (!matches) {
      throw new UnauthorizedException('La contraseña actual es incorrecta');
    }

    const email = dto.email.trim().toLowerCase();
    if (email === user.email.toLowerCase()) {
      return this.getSessionSafeProfile(tenantId, userId);
    }

    const existing = await this.usersRepository.findByEmailInsensitive(email);
    if (existing && existing.id !== userId) {
      throw new ConflictException('El email ya está en uso');
    }

    let count: number;
    try {
      count = await this.usersRepository.update(tenantId, userId, { email });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('El email ya está en uso');
      }
      throw error;
    }
    if (count === 0) throw new NotFoundException('User not found');

    this.eventEmitter.emit('audit.log', {
      tenantId,
      userId,
      module: 'users',
      action: 'user.email_changed',
      resourceId: userId,
      before: { email: user.email },
      after: { email },
    } satisfies AuditLogEvent);

    return this.getSessionSafeProfile(tenantId, userId);
  }

  private async getSessionSafeProfile(tenantId: string, userId: string) {
    const profile = await this.getById(tenantId, userId);
    return { ...profile, tempPassword: null };
  }

  private invalidateSession(event: SessionInvalidateEvent) {
    this.eventEmitter.emit(SESSION_INVALIDATE_EVENT, event);
  }

  async setExtraPermissions(
    tenantId: string,
    id: string,
    permissionKeys: string[],
  ) {
    await this.getById(tenantId, id);

    const permissions =
      await this.rolesRepository.findPermissionsByKeys(permissionKeys);
    if (permissions.length !== permissionKeys.length) {
      throw new BadRequestException('One or more permission keys are invalid');
    }

    await this.usersRepository.setPermissions(
      id,
      permissions.map((p) => p.id),
    );
    this.invalidateSession({ userId: id });
    return this.getById(tenantId, id);
  }

  private resolveTempPassword(user: {
    mustChangePassword: boolean;
    tempPasswordEncrypted: string | null;
    tempPasswordExpiresAt: Date | null;
  }): string | null {
    if (
      user.mustChangePassword &&
      user.tempPasswordEncrypted &&
      user.tempPasswordExpiresAt &&
      user.tempPasswordExpiresAt > new Date()
    ) {
      try {
        return decryptTempPassword(user.tempPasswordEncrypted);
      } catch {
        return null; // Decryption failed (e.g. secret rotated) — treat as expired
      }
    }
    return null;
  }
}
