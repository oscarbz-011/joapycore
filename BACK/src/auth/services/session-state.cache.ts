import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { TenantStatus, UserStatus } from '@prisma/client';
import {
  SESSION_INVALIDATE_EVENT,
  type SessionInvalidateEvent,
} from '../../common/events/session-invalidate.event';
import { TenantsRepository } from '../../tenants/repositories/tenants.repository';
import { UsersRepository } from '../../users/repositories/users.repository';
import { PermissionsResolver } from './permissions.resolver';

// Mismo criterio que TenantModulesCache: la invalidación por evento cubre un
// proceso; el TTL acota lo viejo que puede quedar con varias instancias.
const TTL_MS = 30_000;

export interface SessionState {
  tenantId: string;
  userActive: boolean;
  tenantActive: boolean;
  /** Epoch ms; los tokens emitidos antes no valen. */
  sessionsValidAfter: number | null;
  roles: string[];
  permissions: string[];
}

interface Entry {
  state: SessionState | null;
  expiresAt: number;
}

/**
 * Estado de seguridad vigente de un usuario, consultado en cada request
 * autenticado. El JWT es una foto del login: sin esto, un usuario desactivado,
 * de una empresa suspendida o al que le quitaron permisos seguía operando
 * hasta que vencía el access token.
 */
@Injectable()
export class SessionStateCache {
  private readonly cache = new Map<string, Entry>();

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly tenantsRepository: TenantsRepository,
    private readonly permissionsResolver: PermissionsResolver,
  ) {}

  /** null = el usuario ya no existe. */
  async get(userId: string): Promise<SessionState | null> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.state;

    const state = await this.load(userId);
    this.cache.set(userId, { state, expiresAt: Date.now() + TTL_MS });
    return state;
  }

  @OnEvent(SESSION_INVALIDATE_EVENT)
  invalidate(event: SessionInvalidateEvent): void {
    if (event.userId) this.cache.delete(event.userId);
    if (event.tenantId) {
      for (const [userId, entry] of this.cache) {
        if (entry.state?.tenantId === event.tenantId) this.cache.delete(userId);
      }
    }
  }

  private async load(userId: string): Promise<SessionState | null> {
    const user = await this.usersRepository.findByIdForAuth(userId);
    if (!user || user.deletedAt) return null;
    const [tenant, access] = await Promise.all([
      this.tenantsRepository.findById(user.tenantId),
      this.permissionsResolver.resolve(user.id),
    ]);
    return {
      tenantId: user.tenantId,
      userActive: user.status === UserStatus.ACTIVE,
      tenantActive: tenant?.status === TenantStatus.ACTIVE,
      sessionsValidAfter: user.sessionsValidAfter?.getTime() ?? null,
      roles: access.roles,
      permissions: access.permissions,
    };
  }
}

/** ¿El token (iat en segundos) fue emitido antes del corte de sesiones? */
export function issuedBeforeCutoff(
  iatSeconds: number | undefined,
  sessionsValidAfter: Date | number | null | undefined,
): boolean {
  if (sessionsValidAfter == null) return false;
  const cutoffMs =
    typeof sessionsValidAfter === 'number'
      ? sessionsValidAfter
      : sessionsValidAfter.getTime();
  // iat tiene resolución de segundos: se compara contra el segundo del corte
  // para no invalidar el token que se emite inmediatamente después.
  return (iatSeconds ?? 0) < Math.floor(cutoffMs / 1000);
}
