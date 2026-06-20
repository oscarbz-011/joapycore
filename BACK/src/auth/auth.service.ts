import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { JwtPayload } from '../common/types/jwt-payload.interface';
import { parseDurationMs } from '../common/utils/duration.util';
import { PrismaService } from '../prisma/prisma.service';
import { RolesRepository } from '../users/repositories/roles.repository';
import { UsersRepository } from '../users/repositories/users.repository';
import { toSafeUser } from '../users/entities/user.entity';
import { TenantModulesRepository } from '../tenants/repositories/tenant-modules.repository';
import { TenantsRepository } from '../tenants/repositories/tenants.repository';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokensRepository } from './repositories/refresh-tokens.repository';

const SALT_ROUNDS = 10;
const OWNER_ROLE_NAME = 'Owner';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly eventEmitter: EventEmitter2,
    private readonly usersRepository: UsersRepository,
    private readonly rolesRepository: RolesRepository,
    private readonly tenantsRepository: TenantsRepository,
    private readonly tenantModulesRepository: TenantModulesRepository,
    private readonly refreshTokensRepository: RefreshTokensRepository,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersRepository.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email is already registered');
    }

    const permissions = await this.rolesRepository.findAllPermissions();
    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const user = await this.prisma.$transaction(async (tx) => {
      const tenant = await this.tenantsRepository.create(
        { name: dto.tenantName, industry: dto.industry },
        tx,
      );
      const ownerRole = await this.rolesRepository.create(
        tenant.id,
        OWNER_ROLE_NAME,
        true,
        tx,
      );
      if (permissions.length > 0) {
        await this.rolesRepository.attachPermissions(
          ownerRole.id,
          permissions.map((permission) => permission.id),
          tx,
        );
      }
      const createdUser = await this.usersRepository.create(
        tenant.id,
        {
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
        },
        tx,
      );
      await this.usersRepository.attachRole(createdUser.id, ownerRole.id, tx);
      await this.tenantModulesRepository.seedDefaults(tenant.id, dto.industry, tx);
      return createdUser;
    });

    const tokens = await this.issueTokens(user);
    this.eventEmitter.emit('user.registered', { userId: user.id, tenantId: user.tenantId });
    this.eventEmitter.emit('tenant.registered', { tenantId: user.tenantId, industry: dto.industry });
    return tokens;
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepository.findByEmail(dto.email);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.issueTokens(user);
    this.eventEmitter.emit('user.logged_in', { userId: user.id, tenantId: user.tenantId });
    return { ...tokens, mustChangePassword: user.mustChangePassword };
  }

  async refresh(dto: RefreshTokenDto) {
    const { id, secret } = this.parseRefreshToken(dto.refreshToken);
    const stored = await this.refreshTokensRepository.findById(id);
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const expected = Buffer.from(this.hashRefreshSecret(secret));
    const actual = Buffer.from(stored.tokenHash);
    if (
      expected.length !== actual.length ||
      !timingSafeEqual(expected, actual)
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.refreshTokensRepository.revoke(stored.id);

    const user = await this.usersRepository.findByIdForAuth(stored.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    return this.issueTokens(user);
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const { id } = this.parseRefreshToken(dto.refreshToken);
    const stored = await this.refreshTokensRepository.findById(id);
    if (stored && !stored.revokedAt) {
      await this.refreshTokensRepository.revoke(id);
    }
  }

  private async issueTokens(user: User) {
    const userRoles = await this.usersRepository.findRolesForUser(user.id);
    const roles = userRoles.map((userRole) => userRole.role.name);
    const rolePermissions = userRoles.flatMap((userRole) =>
      userRole.role.rolePermissions.map((rp) => rp.permission.key),
    );
    const userExtraPermissions = await this.usersRepository.findPermissionsForUser(user.id);
    const extraKeys = userExtraPermissions.map((up) => up.permission.key);
    const permissions = Array.from(new Set([...rolePermissions, ...extraKeys]));
    const activeModules =
      await this.tenantModulesRepository.findActiveModuleNames(user.tenantId);

    const tenant = await this.tenantsRepository.findById(user.tenantId);

    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      tenantName: tenant?.name ?? '',
      email: user.email,
      roles,
      permissions,
      activeModules,
    };

    const accessToken = await this.jwtService.signAsync(payload);
    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      user: toSafeUser(user),
    };
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const secret = randomBytes(32).toString('hex');
    const tokenHash = this.hashRefreshSecret(secret);
    const expiresAt = new Date(
      Date.now() +
        parseDurationMs(
          this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
        ),
    );
    const record = await this.refreshTokensRepository.create(
      userId,
      tokenHash,
      expiresAt,
    );
    return `${record.id}.${secret}`;
  }

  private parseRefreshToken(token: string): { id: string; secret: string } {
    const [id, secret] = token.split('.');
    if (!id || !secret) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return { id, secret };
  }

  private hashRefreshSecret(secret: string): string {
    return createHash('sha256').update(secret).digest('hex');
  }
}
