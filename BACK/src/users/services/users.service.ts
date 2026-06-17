import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { UserStatus } from '@prisma/client';
import { RolesRepository } from '../repositories/roles.repository';
import { UsersRepository } from '../repositories/users.repository';
import { AssignUserRolesDto } from '../dto/assign-user-roles.dto';
import { CreateUserDto } from '../dto/create-user.dto';
import { UpdateUserDto } from '../dto/update-user.dto';
import { toSafeUser } from '../entities/user.entity';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
  ) {}

  async list(tenantId: string) {
    const users = await this.usersRepository.findAll(tenantId);
    return users.map(toSafeUser);
  }

  async getById(tenantId: string, id: string) {
    const user = await this.usersRepository.findById(tenantId, id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return toSafeUser(user);
  }

  async create(tenantId: string, dto: CreateUserDto) {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const user = await this.usersRepository.create(tenantId, {
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
    });
    return toSafeUser(user);
  }

  async update(tenantId: string, id: string, dto: UpdateUserDto) {
    const count = await this.usersRepository.update(tenantId, id, dto);
    if (count === 0) {
      throw new NotFoundException('User not found');
    }
    return this.getById(tenantId, id);
  }

  async deactivate(tenantId: string, id: string) {
    const count = await this.usersRepository.update(tenantId, id, {
      status: UserStatus.INACTIVE,
    });
    if (count === 0) {
      throw new NotFoundException('User not found');
    }
    return this.getById(tenantId, id);
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

    await this.usersRepository.setRoles(id, dto.roleIds);
    return this.getById(tenantId, id);
  }
}
