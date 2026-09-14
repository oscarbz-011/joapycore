import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { TenantStatus, User, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
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
import type { AuditLogEvent } from '../audit/audit-log.event';
import { PermissionsResolver } from './services/permissions.resolver';
import { issuedBeforeCutoff } from './services/session-state.cache';
import { SESSION_INVALIDATE_EVENT } from '../common/events/session-invalidate.event';

const SALT_ROUNDS = 10;
const OWNER_ROLE_NAME = 'Owner';
// Dos pestañas pueden rotar el mismo refresh token casi a la vez: presentar
// uno recién revocado dentro de esta ventana es una carrera, no un robo.
const REFRESH_REUSE_GRACE_MS = 60_000;

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
    private readonly permissionsResolver: PermissionsResolver,
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
        {
          name: dto.tenantName,
          industry: dto.industry,
          employeeCount: dto.employeeCount,
        },
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
          username: dto.username,
        },
        tx,
      );
      await this.usersRepository.attachRole(createdUser.id, ownerRole.id, tx);
      await this.tenantModulesRepository.seedDefaults(
        tenant.id,
        dto.industry,
        tx,
      );
      await this.tenantsRepository.createHeadquarters(tenant.id, tx);
      return createdUser;
    });

    const tokens = await this.issueTokens(user);
    this.eventEmitter.emit('user.registered', {
      userId: user.id,
      tenantId: user.tenantId,
    });
    this.eventEmitter.emit('tenant.registered', {
      tenantId: user.tenantId,
      industry: dto.industry,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId: user.tenantId,
      userId: user.id,
      module: 'auth',
      action: 'user.registered',
      resourceId: user.id,
    } satisfies AuditLogEvent);
    return tokens;
  }

  async login(dto: LoginDto) {
    const user = await this.usersRepository.findByEmailOrUsername(
      dto.emailOrUsername,
    );
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

    // Reject login if the temporary password has expired and was never changed
    if (
      user.mustChangePassword &&
      user.tempPasswordExpiresAt &&
      user.tempPasswordExpiresAt < new Date()
    ) {
      throw new UnauthorizedException(
        'La contraseña temporal expiró. Solicitá al administrador que genere una nueva.',
      );
    }

    await this.assertTenantActive(user.tenantId);

    await this.usersRepository.update(user.tenantId, user.id, {
      lastLoginAt: new Date(),
    });

    const tokens = await this.issueTokens(user);
    this.eventEmitter.emit('user.logged_in', {
      userId: user.id,
      tenantId: user.tenantId,
    });
    this.eventEmitter.emit('audit.log', {
      tenantId: user.tenantId,
      userId: user.id,
      module: 'auth',
      action: 'user.logged_in',
      resourceId: user.id,
    } satisfies AuditLogEvent);
    return { ...tokens, mustChangePassword: user.mustChangePassword };
  }

  async refresh(dto: RefreshTokenDto) {
    const { id, secret } = this.parseRefreshToken(dto.refreshToken);
    const stored = await this.refreshTokensRepository.findById(id);
    if (!stored) {
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

    if (stored.revokedAt) {
      // Un token ya rotado que vuelve a aparecer fuera de la ventana de
      // carrera entre pestañas indica que alguien más lo tiene: se cierran
      // todas las sesiones del usuario.
      if (Date.now() - stored.revokedAt.getTime() > REFRESH_REUSE_GRACE_MS) {
        await this.refreshTokensRepository.revokeAllForUser(stored.userId);
        this.eventEmitter.emit(SESSION_INVALIDATE_EVENT, {
          userId: stored.userId,
        });
      }
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.refreshTokensRepository.revoke(stored.id);

    const user = await this.usersRepository.findByIdForAuth(stored.userId);
    if (!user || user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    // Emitido antes de cambiar la contraseña o de desactivar/reactivar.
    if (
      issuedBeforeCutoff(
        Math.floor(stored.createdAt.getTime() / 1000),
        user.sessionsValidAfter,
      )
    ) {
      throw new UnauthorizedException(
        'La sesión fue cerrada. Iniciá sesión de nuevo.',
      );
    }
    await this.assertTenantActive(user.tenantId);

    return this.issueTokens(user);
  }

  async logout(dto: RefreshTokenDto): Promise<void> {
    const { id } = this.parseRefreshToken(dto.refreshToken);
    const stored = await this.refreshTokensRepository.findById(id);
    if (stored && !stored.revokedAt) {
      await this.refreshTokensRepository.revoke(id);
    }
  }

  private async assertTenantActive(tenantId: string): Promise<void> {
    const tenant = await this.tenantsRepository.findById(tenantId);
    if (tenant?.status !== TenantStatus.ACTIVE) {
      throw new UnauthorizedException(
        'La empresa está suspendida. Contactá al administrador.',
      );
    }
  }

  private async issueTokens(user: User) {
    const { roles, permissions } = await this.permissionsResolver.resolve(
      user.id,
    );
    await this.tenantModulesRepository.backfillMissing(user.tenantId);
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
