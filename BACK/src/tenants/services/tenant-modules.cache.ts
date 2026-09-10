import { Injectable } from '@nestjs/common';
import { TenantModulesRepository } from '../repositories/tenant-modules.repository';

// TTL de respaldo. La invalidación explícita (ver TenantModulesService.
// setActive) cubre el caso normal en un solo proceso; el TTL acota cuánto
// puede quedar viejo el caché si algún día se corre en varias instancias,
// donde el toggle de una no invalida el caché de las otras. Cuando haga falta
// escalar horizontalmente, esto se reemplaza por Redis (que es lo que asume
// CLAUDE.md) sin tocar el guard ni el servicio: solo esta clase.
const TTL_MS = 30_000;

interface CacheEntry {
  modules: string[];
  expiresAt: number;
}

/**
 * Módulos activos de un tenant, leídos de la base y cacheados en memoria.
 *
 * Existe porque `TenantModuleGuard` corre en CADA request y no puede pegarle
 * a la base siempre — pero tampoco puede leer del JWT: `activeModules` en el
 * token es una foto del momento del login, así que activar un módulo no
 * tenía efecto hasta volver a loguearse.
 */
@Injectable()
export class TenantModulesCache {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly tenantModulesRepository: TenantModulesRepository,
  ) {}

  async getActiveModules(tenantId: string): Promise<string[]> {
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.modules;
    }

    const modules =
      await this.tenantModulesRepository.findActiveModuleNames(tenantId);
    this.cache.set(tenantId, { modules, expiresAt: Date.now() + TTL_MS });
    return modules;
  }

  /** Se llama al activar/desactivar un módulo — el cambio se ve al instante. */
  invalidate(tenantId: string) {
    this.cache.delete(tenantId);
  }
}
