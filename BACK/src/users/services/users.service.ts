import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UserStatus } from '@prisma/client';
import { RolesRepository } from '../repositories/roles.repository';
import { UsersRepository } from '../repositories/users.repository';
import { AssignUserRolesDto } from '../dto/assign-user-roles.dto';
import { ChangePasswordDto } from '../dto/change-password.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { toSafeUserWithRoles } from '../entities/user.entity';

const SALT_ROUNDS = 10;
const OWNER_ROLE_NAME = 'Owner';

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
  ) {}

  async list(tenantId: string) {
    const users = await this.usersRepository.findAll(tenantId);
    return users.map(toSafeUserWithRoles);
  }

  async getById(tenantId: string, id: string) {
    const user = await this.usersRepository.findById(tenantId, id);
    if (!user) throw new NotFoundException('User not found');
    return toSafeUserWithRoles(user);
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already in use');

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersRepository.create(tenantId, {
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    return this.getById(tenantId, user.id);
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const count = await this.usersRepository.update(tenantId, id, dto);
    if (count === 0) throw new NotFoundException('User not found');
    return this.getById(tenantId, id);
  }

  async deactivate(tenantId: string, id: string) {
    const count = await this.usersRepository.update(tenantId, id, {
      status: UserStatus.INACTIVE,
    });
    if (count === 0) throw new NotFoundException('User not found');
    return this.getById(tenantId, id);
  }

  async reactivate(tenantId: string, id: string) {
    const count = await this.usersRepository.update(tenantId, id, {
      status: UserStatus.ACTIVE,
    });
    if (count === 0) throw new NotFoundException('User not found');
    return this.getById(tenantId, id);
  }

  async resetPassword(tenantId: string, id: string): Promise<{ tempPassword: string }> {
    const user = await this.usersRepository.findById(tenantId, id);
    if (!user) throw new NotFoundException('User not found');
    const tempPassword = crypto.randomBytes(8).toString('base64url').slice(0, 10);
    const passwordHash = await bcrypt.hash(tempPassword, SALT_ROUNDS);
    await this.usersRepository.update(tenantId, id, { passwordHash, mustChangePassword: true });
    return { tempPassword };
  }

  async assignRoles(tenantId: string, id: string, dto: AssignUserRolesDto) {
    await this.getById(tenantId, id);

    const roles = await this.rolesRepository.findManyByIds(tenantId, dto.roleIds);
    if (roles.length !== dto.roleIds.length) {
      throw new BadRequestException('One or more roles do not belong to this tenant');
    }

    const ownerRole = roles.find((r) => r.name === OWNER_ROLE_NAME && r.isSystem);
    if (ownerRole) {
      throw new ForbiddenException('Cannot assign the Owner role to a regular user');
    }

    await this.usersRepository.setRoles(id, dto.roleIds);
    return this.getById(tenantId, id);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.usersRepository.findByIdForAuth(userId);
    if (!user) throw new NotFoundException('User not found');

    const matches = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!matches) throw new BadRequestException('La contraseña actual es incorrecta');

    const newHash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);
    await this.usersRepository.update(user.tenantId, userId, {
      passwordHash: newHash,
      mustChangePassword: false,
    });
  }

  async setExtraPermissions(tenantId: string, id: string, permissionKeys: string[]) {
    await this.getById(tenantId, id);

    const permissions = await this.rolesRepository.findPermissionsByKeys(permissionKeys);
    if (permissions.length !== permissionKeys.length) {
      throw new BadRequestException('One or more permission keys are invalid');
    }

    await this.usersRepository.setPermissions(
      id,
      permissions.map((p) => p.id),
    );
    return this.getById(tenantId, id);
  }
}
